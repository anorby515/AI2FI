// GettingStarted — the landing view a fresh user sees when the dashboard is
// seeded with sample data. It's selected by default when the server reports
// `isSampleData: true`, and stays in the sidebar until the /financial-check-in
// onboarding skill clears the .sample-data marker at Part 3 close.
//
// Purpose: bridge the user from "I installed the dashboard" to "I'm talking
// to Claude." The dashboard doesn't do onboarding itself — the boot experience
// in core/boot-experience.md does that, inside Claude. This view just hands them
// off cleanly.

export default function GettingStarted({ profileName }) {
  return (
    <div className="getting-started">
      <div className="gs-card">
        <div className="gs-chip">SAMPLE DATA</div>
        <h1>Welcome to AI2FI</h1>
        <p className="gs-lede">
          You're looking at a fully-functional dashboard powered by sample data, so you can
          poke around and see what AI2FI looks like before you commit anything real.
          The real onboarding happens in Claude &mdash; that's where the coaching actually lives.
        </p>

        <h2>Next step: meet your coach</h2>
        <ol className="gs-steps">
          <li>
            <strong>Open this folder in Claude.</strong>{' '}
            Use Claude Code, Claude Desktop, or{' '}
            <a href="https://claude.ai/code" target="_blank" rel="noreferrer">claude.ai/code</a>{' '}
            and point it at your AI2FI directory.
          </li>
          <li>
            <strong>Type the trigger phrase:</strong>
            <pre className="gs-command"><code>let&rsquo;s start my financial journey</code></pre>
            <span className="gs-muted">Or just type <code>/financial-check-in</code> &mdash; same thing.</span>
          </li>
          <li>
            <strong>Claude walks you through the three-part intro.</strong>{' '}
            Part&nbsp;1 gets to know you, Part&nbsp;2 walks the financial framework, Part&nbsp;3 sets your first goals.
            Takes about 30 minutes across one or more sittings. Nothing is uploaded &mdash; everything stays on your Mac.
          </li>
          <li>
            <strong>Your real data replaces the sample.</strong>{' '}
            When you finish Part&nbsp;3, Claude swaps the sample spreadsheet out for yours.
            This screen goes away. The dashboard is yours.
          </li>
        </ol>

        <div className="gs-callout">
          <strong>Where you are now:</strong> the dashboard is running at{' '}
          <code>http://localhost:3001</code>, reading{' '}
          <code>user-profiles/{profileName || '&lt;you&gt;'}/private/Finances.xlsx</code>{' '}
          &mdash; which is a copy of the committed sample. Nothing here is your data yet.
        </div>

        <h2>Want to explore first?</h2>
        <p>
          Use the sidebar to wander around &mdash; Net Worth, Portfolio, Moat Analysis.
          The numbers are fictional, but the views are the real thing.
          When you're ready, come back here and run the trigger phrase in Claude.
        </p>
      </div>
    </div>
  );
}
