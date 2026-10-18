// Crossy Road: Custom Edition desktop launcher.
//
// The whole web build (../../dist) is embedded in this executable. On start it
// serves the game on a local port and opens it in a chromeless app window
// (Microsoft Edge or Chrome "--app" mode), falling back to the default browser.
// The launcher exits when the game window closes.
package main

import (
	"context"
	"embed"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync/atomic"
	"time"
)

//go:embed all:dist
var dist embed.FS

const (
	appID = "crossy-road-custom-edition"
	// A fixed port keeps the page origin stable, so imported models and
	// distance records (stored by the browser per origin) survive restarts.
	preferredAddr = "127.0.0.1:47831"
	// The page pings every few seconds; minimized windows may throttle that
	// to about once a minute, so allow plenty of slack before quitting.
	pingTimeout = 150 * time.Second
)

func main() {
	ln, err := net.Listen("tcp", preferredAddr)
	if err != nil {
		if alreadyRunning() {
			// Another copy is serving the game; just open another window.
			openWindow("http://"+preferredAddr+"/?launcher=1", false)
			return
		}
		ln, err = net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			fatal("Could not start the game server: " + err.Error())
		}
	}
	url := fmt.Sprintf("http://%s/?launcher=1", ln.Addr().String())

	var lastPing atomic.Int64
	lastPing.Store(time.Now().Unix())

	site, _ := fs.Sub(dist, "dist")
	mux := http.NewServeMux()
	mux.HandleFunc("/__launcher/ping", func(w http.ResponseWriter, r *http.Request) {
		lastPing.Store(time.Now().Unix())
		w.Header().Set("Cache-Control", "no-store")
		io.WriteString(w, appID)
	})
	mux.Handle("/", http.FileServer(http.FS(site)))
	go http.Serve(ln, mux)

	done := make(chan struct{}, 1)
	if cmd := openWindow(url, true); cmd != nil {
		go func() {
			cmd.Wait()
			done <- struct{}{}
		}()
	}

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-done:
			return
		case <-ticker.C:
			if time.Since(time.Unix(lastPing.Load(), 0)) > pingTimeout {
				return
			}
		}
	}
}

func alreadyRunning() bool {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "GET", "http://"+preferredAddr+"/__launcher/ping", nil)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return false
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 128))
	return string(body) == appID
}

// openWindow opens the game in an app-mode browser window. It returns the
// browser process when it owns a dedicated one (so the launcher can wait for
// it), or nil when it fell back to the default browser.
func openWindow(url string, own bool) *exec.Cmd {
	if browser := findAppBrowser(); browser != "" {
		args := []string{
			"--app=" + url,
			"--window-size=1280,800",
			"--no-first-run",
			"--no-default-browser-check",
			"--autoplay-policy=no-user-gesture-required",
		}
		if dir := profileDir(); dir != "" {
			// A separate profile gives the game its own browser process and
			// its own saved data, independent of the user's normal browsing.
			args = append(args, "--user-data-dir="+dir)
		}
		cmd := exec.Command(browser, args...)
		if err := cmd.Start(); err == nil {
			if own {
				return cmd
			}
			return nil
		}
	}
	if err := openDefault(url); err != nil {
		fatal("Could not open a browser window.\n\nOpen this address manually:\n" + url)
	}
	return nil
}

func profileDir() string {
	base, err := os.UserCacheDir() // %LOCALAPPDATA% on Windows
	if err != nil {
		return ""
	}
	dir := filepath.Join(base, "CrossyRoadCustomEdition", "profile")
	if os.MkdirAll(dir, 0o755) != nil {
		return ""
	}
	return dir
}

func findAppBrowser() string {
	var candidates []string
	switch runtime.GOOS {
	case "windows":
		roots := []string{os.Getenv("ProgramFiles(x86)"), os.Getenv("ProgramFiles"), os.Getenv("LOCALAPPDATA")}
		for _, root := range roots {
			if root == "" {
				continue
			}
			candidates = append(candidates,
				filepath.Join(root, "Microsoft", "Edge", "Application", "msedge.exe"),
				filepath.Join(root, "Google", "Chrome", "Application", "chrome.exe"),
			)
		}
	case "darwin":
		candidates = []string{
			"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
			"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		}
	default:
		for _, name := range []string{"microsoft-edge", "google-chrome", "chromium", "chromium-browser"} {
			if p, err := exec.LookPath(name); err == nil {
				candidates = append(candidates, p)
			}
		}
	}
	for _, c := range candidates {
		if info, err := os.Stat(c); err == nil && !info.IsDir() {
			return c
		}
	}
	return ""
}

func openDefault(url string) error {
	switch runtime.GOOS {
	case "windows":
		return exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	case "darwin":
		return exec.Command("open", url).Start()
	default:
		return exec.Command("xdg-open", url).Start()
	}
}
