// GettingStarted — the landing view a fresh user sees when the dashboard is
// reading from the committed demo template. Selected automatically when the
// server reports `isTemplate: true`, and drops out of the sidebar as soon as
// the user's own `private/Finances.xlsx` appears (the Coach copies it during
// the consent step in core/finances-template-setup.md).
//
// Purpose: bridge the user from "I installed the dashboard" to "I'm talking
// to Claude." The dashboard doesn't do onboarding itself — the boot experience
// in core/boot-experience.md does that, inside Claude. This view just hands them
// off cleanly.

export default function GettingStarted({ profileName }) {
  return (
    <div className="getting-started">
      <div className="gs-card">
        <div className="gs-chip">DEMO TEMPLATE</div>
        <h1>Welcome to AI2FI</h1>
        <p className="gs-lede">
          You're looking at a fully-functional dashboard powered by the committed demo template, so
          you can poke around and see what AI2FI looks like before you commit anything real.
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
            <strong>Your real data replaces the demo.</strong>{' '}
            When you consent during onboarding, Claude copies the template into your profile
            at <code>user-profiles/{profileName || '<you>'}/private/Finances.xlsx</code>.
            The dashboard auto-detects the new file on the next poll &mdash; this screen drops away,
            the demo banner clears, and the dashboard is yours.
          </li>
        </ol>

        <div className="gs-callout">
          <strong>Where you are now:</strong> the dashboard is running at{' '}
          <code>http://localhost:3001</code>, reading directly from{' '}
          <code>core/sample-data/Financial Template.xlsx</code>. None of these numbers are yours yet.
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
