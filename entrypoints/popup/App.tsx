import { useEffect, useState } from 'react';

/**
 * Popup placeholder (M0). The full state machine (Idle/Extracting/Analyzing/
 * Results/NoContent/Error) and result presentation land in M1.
 */
export function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  return (
    <main className="popup">
      <h1>Slopwatch</h1>
      <p className="tagline">A probabilistic second opinion on whether text is AI-generated.</p>
      <p className="status" role="status">
        {ready ? 'Ready. Click the toolbar icon on an article to analyze it.' : 'Loading…'}
      </p>
      <p className="caveat">
        This is a signal, not a verdict. Both false positives and false negatives are common.
      </p>
    </main>
  );
}
