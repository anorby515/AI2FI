import { Card } from '../ui';
import './MoatAnalysis.css';

export default function MoatAnalysis() {
  return (
    <div className="moat-analysis">
      <div className="moat-analysis__head">
        <h1>Moat Analysis</h1>
        <p className="moat-analysis__lede">
          A monthly or quarterly rhythm for evaluating the durable competitive
          advantages — the &ldquo;moats&rdquo; — of every company you own.
        </p>
      </div>

      <Card>
        <h2>What the framework does</h2>
        <p>
          AI2FI ships an executable prompt at{' '}
          <code>modules/investing/moat-analysis-framework.md</code> that turns
          any capable AI agent into a moat analyst. Given a single ticker it
          will:
        </p>
        <ul>
          <li>Pull current financial data and Morningstar coverage for the company.</li>
          <li>
            Evaluate all five sources of economic moat — Switching Costs,
            Intangible Assets, Network Effects, Low-Cost Production, and
            Counter-Positioning — with concrete evidence for each.
          </li>
          <li>
            Classify the moat as <strong>Wide</strong>, <strong>Narrow</strong>, or{' '}
            <strong>None</strong>, and the trajectory as{' '}
            <strong>Widening</strong>, <strong>Stable</strong>, or <strong>Narrowing</strong>,
            using strict criteria so the output is comparable across companies and
            across time.
          </li>
          <li>
            Emit a clean Markdown report with the size, direction, primary
            source(s), a one-paragraph summary, and a section per moat source.
          </li>
        </ul>
      </Card>

      <Card>
        <h2>Suggested workflow</h2>
        <ol>
          <li>
            <strong>Export your ticker list.</strong> Pull the symbols you own
            from any of the Portfolio Analysis pages (HSA, Retirement, ESA,
            Brokerage).
          </li>
          <li>
            <strong>Hand the list to an AI agent</strong> together with the
            framework prompt. Run it once per ticker. Most users do this on a
            monthly or quarterly cadence — moats move slowly, so monthly is
            usually plenty.
          </li>
          <li>
            <strong>Save each report as a Markdown file.</strong> See the next
            card for the exact path so the dashboard can pick it up.
          </li>
          <li>
            <strong>Feed the reports into a notebook tool.</strong> Upload the
            month&rsquo;s Moat Analyses — alongside any earnings notes,
            10-Q/10-K excerpts, or other market research you collect — into a
            tool like <strong>NotebookLM</strong>. That gives you a single place
            to ask cross-cutting questions: &ldquo;Which of my Wide moats are
            narrowing?&rdquo;, &ldquo;What changed for my Network Effect names
            this quarter?&rdquo;, etc.
          </li>
        </ol>
      </Card>

      <Card>
        <h2>Where to save the reports</h2>
        <p>
          The per-ticker chart page (the page you see when you click into a
          holding from the Holdings list) automatically loads a moat analysis
          for that ticker if one exists. The dashboard reads from your
          profile&rsquo;s <code>research/</code> directory:
        </p>
        <pre><code>user-profiles/&lt;your-name&gt;/research/&lt;TICKER&gt;.md</code></pre>
        <p>
          For example, an Apple analysis goes at{' '}
          <code>user-profiles/&lt;your-name&gt;/research/AAPL.md</code>. The
          file should follow the format the framework emits — the parser keys
          on these header lines:
        </p>
        <ul>
          <li><code>**Moat Size:**</code> Wide / Narrow / None</li>
          <li><code>**Moat Direction:**</code> Widening / Stable / Narrowing</li>
          <li><code>**Primary Moat Source(s):**</code> e.g. Switching Costs, Intangible Assets</li>
          <li><code>**Summary:**</code> one paragraph</li>
          <li>One <code>## Section</code> per moat source, each with an <code>**Assessment:**</code> line</li>
        </ul>
        <p className="moat-analysis__note">
          Everything under <code>user-profiles/&lt;your-name&gt;/</code> is
          gitignored, so your research never leaves the machine.
        </p>
      </Card>

      <Card>
        <h2>Where the framework lives</h2>
        <p>
          The full prompt — including the strict classification criteria, the
          output template, and the section-by-section instructions — is at:
        </p>
        <pre><code>modules/investing/moat-analysis-framework.md</code></pre>
        <p>
          Copy the contents of that file into your AI agent of choice (Claude,
          ChatGPT, Gemini, etc.) at the start of each session. The prompt is
          self-contained and will ask for the ticker.
        </p>
      </Card>
    </div>
  );
}
