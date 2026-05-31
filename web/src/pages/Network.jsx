import { useState } from "react";
import { api, fmt } from "../api";
import { useAsync } from "../hooks/useAsync";
import { Card, Loading, ErrorBanner, PageHead, StatCard } from "../components/Common.jsx";
import NetworkGraph from "../components/NetworkGraph.jsx";
import CaseNoteAnalyzer from "../components/CaseNoteAnalyzer.jsx";
import Icon from "../components/Icon.jsx";

export default function Network() {
  const [gangFilter, setGangFilter] = useState("");
  const summary = useAsync(() => api.netSummary(), []);
  const gangs = useAsync(() => api.netGangs(), []);
  const repeat = useAsync(() => api.netRepeatOffenders(10), []);
  const money = useAsync(() => api.netMoneyTrail(10), []);
  const graph = useAsync(() => api.netGraph(gangFilter ? { gang: gangFilter, maxNodes: 200 } : { maxNodes: 200 }), [gangFilter]);

  return (
    <>
      <PageHead icon="network" title="Network &amp; Behavioural Analysis"
        subtitle="Criminal network graph, repeat-offender tracking, gang detection, and money-trail analysis." />
      <div className="synthetic-banner">
        <span className="sb-ic"><Icon name="alert" size={18} /></span>
        <span>Demonstration module using <b>synthetic record-level data</b>, statistically grounded in the
        real district & crime distributions. The public KSP dataset is aggregate-only (no FIRs/offenders),
        so this showcases the network &amp; profiling capability for when SCRB record-level data is integrated.</span>
      </div>

      {summary.data && (
        <div className="kpi-row">
          <StatCard cls="accent" icon="network" rawValue={summary.data.counts.offenders} label="Offenders (synthetic)" />
          <StatCard cls="warn" icon="alert" rawValue={summary.data.counts.incidents} label="Incidents" />
          <StatCard cls="danger" icon="shield" rawValue={summary.data.counts.gangs} label="Organized groups" />
          <StatCard cls="ok" icon="patterns" rawValue={summary.data.counts.links} label="Network links" />
        </div>
      )}

      <Card
        title="Criminal network graph"
        icon="network"
        headRight={
          <div className="controls">
            <label>
              Filter
              <select value={gangFilter} onChange={(e) => setGangFilter(e.target.value)}>
                <option value="">All networks</option>
                {gangs.data?.results?.map((g) => (
                  <option key={g.gang_id} value={g.gang_id}>{g.gang_id} ({g.member_count})</option>
                ))}
              </select>
            </label>
          </div>
        }
      >
        {graph.loading && <Loading />}
        {graph.error && <ErrorBanner message={graph.error} />}
        {graph.data && <NetworkGraph data={graph.data} />}
        <p className="note">Edges: blue = co-offender, grey = associate, green = financial. Drag-free force layout; hover a node for details.</p>
      </Card>

      <div className="grid-2">
        <Card title="Repeat offenders & cross-jurisdiction activity" icon="network">
          {repeat.loading && <Loading />}
          {repeat.error && <ErrorBanner message={repeat.error} />}
          {repeat.data && (
            <table>
              <thead><tr><th>Name</th><th>Home</th><th className="right">Incidents</th><th className="right">Jurisd.</th><th className="right">MOs</th></tr></thead>
              <tbody>
                {repeat.data.results.map((r) => (
                  <tr key={r.offender_id}>
                    <td>{r.name}{r.gang_id ? <span className="band Critical" style={{ marginLeft: 6 }}>{r.gang_id}</span> : null}</td>
                    <td>{r.home_district}</td>
                    <td className="right">{r.incident_count}</td>
                    <td className="right">{r.jurisdictions}</td>
                    <td className="right">{r.distinct_mo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Suspicious financial accounts (money trail)" icon="money">
          {money.loading && <Loading />}
          {money.error && <ErrorBanner message={money.error} />}
          {money.data && (
            <table>
              <thead><tr><th>Account</th><th>Bank</th><th className="right">Linked</th><th>Flag</th></tr></thead>
              <tbody>
                {money.data.results.map((m) => (
                  <tr key={m.account_id}>
                    <td>{m.account_id}</td>
                    <td>{m.bank}</td>
                    <td className="right">{m.linked_offenders}</td>
                    <td>{m.flagged ? <span className="band Critical">flagged</span> : <span className="band Low">clear</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <Card title="Organized groups (gang detection)" icon="shield">
        {gangs.loading && <Loading />}
        {gangs.error && <ErrorBanner message={gangs.error} />}
        {gangs.data && (
          <table>
            <thead><tr><th>Group</th><th className="right">Members</th><th className="right">Incidents</th><th className="right">Jurisdictions</th><th className="right">Distinct MO</th><th className="right">Shared accts</th></tr></thead>
            <tbody>
              {gangs.data.results.map((g) => (
                <tr key={g.gang_id} style={{ cursor: "pointer" }} onClick={() => setGangFilter(g.gang_id)}>
                  <td>{g.gang_id}</td>
                  <td className="right">{g.member_count}</td>
                  <td className="right">{g.total_incidents}</td>
                  <td className="right">{g.jurisdictions}</td>
                  <td className="right">{g.distinct_mo}</td>
                  <td className="right">{g.shared_accounts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="note">Click a group to focus the network graph on its members.</p>
      </Card>

      <CaseNoteAnalyzer />
    </>
  );
}
