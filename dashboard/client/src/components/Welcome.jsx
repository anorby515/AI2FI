// Welcome page — embeds the standalone /welcome.html static asset
// served from public/. Keeping the content as a real HTML file (rather
// than inlining the markup in JSX) makes it easy to edit copy without
// touching the React app, and the file can be opened directly in a browser.
export default function Welcome() {
  return (
    <iframe
      src="/welcome.html"
      title="Welcome to AI2FI"
      className="welcome-frame"
      style={{
        width: '100%',
        // Account for the app header (~52px) and the status bar (~48px) above <main>
        height: 'calc(100vh - 100px)',
        border: 'none',
        display: 'block',
        background: 'var(--bg)',
      }}
    />
  );
}
