// OnboardingEmptyState — rendered when the server has no profile or no
// spreadsheet to read from. This is the "you just installed AI2FI, what now?"
// screen, shown in place of the dashboard's normal holdings grid.
//
// The server returns structured { noProfile | noSpreadsheet } responses from
// /api/portfolio, /api/networth, etc. — this component takes that object and
// turns it into instructions tailored to where the user is stuck.

export default function OnboardingEmptyState({ info }) {
  const noProfile = info && info.noProfile;
  const profileName = info && info.profileName;
  const expectedPath = info && info.expectedPath;

  return (
    <div className="onboarding-empty">
      <div className="onboarding-card">
        <h1>You're almost there</h1>
        <p className="onboarding-lede">
          The dashboard is running, but it doesn't have any financial data to show yet.
          Add yours below — nothing leaves your machine.
        </p>

        {noProfile ? (
          <>
            <h2>1. Create your profile folder</h2>
            <p>
              Inside the AI2FI folder, create a directory under <code>user-profiles/</code>
              with your name (or any identifier you want to use). For example:
            </p>
            <pre><code>mkdir -p user-profiles/you/private</code></pre>
            <p className="onboarding-muted">
              Look at <code>user-profiles/example/</code> for the expected layout.
              Everything inside your profile folder is gitignored — it never leaves your machine.
            </p>

            <h2>2. Drop in your spreadsheet</h2>
            <p>Save your finances spreadsheet to:</p>
            <pre><code>user-profiles/you/private/Finances.xlsx</code></pre>
          </>
        ) : (
          <>
            <h2>Drop in your spreadsheet</h2>
            <p>
              Your profile directory is set up as <code>user-profiles/{profileName}/</code>,
              but the dashboard can't find your spreadsheet yet. Save it at:
            </p>
            <pre><code>{expectedPath || `user-profiles/${profileName}/private/Finances.xlsx`}</code></pre>
            <p className="onboarding-muted">
              The expected sheet names are <code>Brokerage Ledger</code> and <code>Net Worth MoM</code>.
              See <code>user-profiles/example/</code> for the expected shape.
            </p>
          </>
        )}

        <h2>3. Refresh</h2>
        <p>
          Once the file is in place,{' '}
          <a href="" onClick={e => { e.preventDefault(); window.location.reload(); }}>
            reload this page
          </a>{' '}
          and your portfolio will show up.
        </p>

        <div className="onboarding-hint">
          <strong>Want to override the auto-detect?</strong> Set{' '}
          <code>AI2FI_PROFILE=yourname</code> in <code>dashboard/.env</code>, or
          create <code>.ai2fi-config</code> at the repo root with{' '}
          <code>{'{ "profile": "yourname" }'}</code>.
        </div>
      </div>
    </div>
  );
}
