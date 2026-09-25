"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { getPositions } from "@/lib/api";
import { errorCopy } from "@/lib/copy";
import type { Position } from "@/lib/types";
import type { Session } from "@/lib/use-session";

export function PositionsPanel({ session, onClose }: { session: Session; onClose: () => void }) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const address = session.address;
  const getAccessToken = session.getAccessToken;
  const refresh = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const token = await getAccessToken();
      const result = await getPositions(address, token);
      setPositions(result.positions);
      setError("");
    } catch (cause) {
      setError(errorCopy(cause));
    } finally {
      setLoading(false);
    }
  }, [address, getAccessToken]);

  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <div className="overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="sheet positions-sheet" role="dialog" aria-modal="true" aria-label="My positions">
        <div className="sheet-head"><div><span className="eyebrow">Portfolio</span><h2>My positions</h2></div><div className="sheet-tools"><button type="button" className="icon-action" onClick={refresh} aria-label="Refresh positions" title="Refresh"><RefreshCw size={18} /></button><button type="button" className="icon-action" onClick={onClose} aria-label="Close positions" title="Close"><X size={20} /></button></div></div>
        {!session.address ? <p className="empty-note">Sign in to view your positions.</p> :
          loading ? <p className="empty-note">Loading positions...</p> :
          error ? <p className="inline-error">{error}</p> :
          positions.length === 0 ? <p className="empty-note">No positions yet.</p> :
          <div className="positions-list">{positions.map((position, index) => (
            <article className="position-row" key={position.panta_market_id + position.side + index}>
              <div><strong>{position.side}</strong><span>{position.panta_market_id.slice(0, 9)}...{position.panta_market_id.slice(-5)}</span></div>
              <div className="position-right"><strong>{position.shares.toLocaleString(undefined, { maximumFractionDigits: 4 })} shares</strong><span>{position.claimable ? "Claimable" : position.phase}</span></div>
            </article>
          ))}</div>}
      </section>
    </div>
  );
}
