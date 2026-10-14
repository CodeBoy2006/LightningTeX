// Why a local update did not happen, as a code the interface can phrase in the reader's language.
// The engine keeps its English reasons (they are part of the package API); this table maps them.
// tone: 'wait' (typing is mid-way; nothing is wrong), 'full' (this kind of edit needs a full pass),
// 'rebuild' (the engine restarts), 'check' (an internal layout check failed), 'off' (live mode unavailable).
const RULES=[
  [/^Waiting for content$/,'wait','content'],
  [/^Waiting for (?:a command argument|an argument)$/,'wait','argument'],
  [/^Waiting for a command$/,'wait','command'],
  [/^Waiting for a (?:short title|heading title)$/,'wait','heading'],
  [/^Waiting for a script$/,'wait','script'],
  [/^(?:Unbalanced (?:math delimiter|delimiters|braces)|Waiting for the expression to close)$/,'wait','close'],
  [/^Unbalanced environment$/,'wait','environment'],
  [/^Preamble changed; rebuilding the engine$/,'rebuild','preamble'],
  [/^Live engine (?:restarted|ended|did not become ready)$/,'rebuild','engine'],
  [/^Environment needs full layout(?:: (.+))?$/,'full','environment',match=>({name:match[1]||''})],
  [/^Command needs full layout: \\?(.+)$/,'full','command',match=>({name:'\\'+match[1]})],
  [/^(?:Custom setup needs a full document pass|Body macro state requires full layout)$/,'full','setup'],
  [/^This edit needs full-document layout$/,'full','structure'],
  [/^(?:Only top-level text and math units are live|Composite or nested paragraphs require full layout)$/,'full','nested'],
  [/^Run-in headings require full layout$/,'full','runin'],
  [/^Counter changes require full layout$/,'full','counter'],
  [/^Complex short title needs full layout$/,'full','shortTitle'],
  [/^Complex citation needs full layout$/,'full','citation'],
  [/^Complex (?:label|tag) needs full layout$/,'full','label'],
  [/^(?:Drawing outside unit rows requires full layout|Unsupported drawing item .* requires full layout|Unbounded page drawing requires full layout|Unsupported local drawing)$/,'full','drawing'],
  [/^(?:Unsupported color state|Color stack underflow|Unclosed color stack) requires full layout$/,'full','color'],
  [/^(?:Unit ink (?:overlaps (?:another row|an image|page drawing)|leaves the page)|Reflow ink leaves the page width|Live regions overlap)$/,'full','overlap'],
  [/^Reflow preview exceeds canvas size limit$/,'full','size'],
  [/^Unsupported source characters$/,'full','characters'],
  [/^Incremental mode requires COOP\/COEP headers\.?$/,'off','isolation'],
  [/^This browser edition supports source files up to/,'off','size'],
  // Internal verification: the edit itself was fine, the proof that only one paragraph changed was not.
  [/^(?:Baseline verification: .*|No unambiguous paragraph context|No captured (?:row )?placements|Paragraph has unsupported engine flags|Missing display-list rows|Unsupported or degraded display list|Missing page \d+ display list|Captured rows do not match placements|Ambiguous or missing unit row index|Captured row and placement disagree|Invalid row .*|Malformed drawing item|Missing stable font descriptor|Invalid (?:glyph|rule) metrics|Row count differs from captured baseline|Row \d+ .* differ|No glyphs to prove baseline equivalence|Missing (?:unit|original unit) (?:ink )?bounds|Invalid unit ink bounds|Missing row placement|Missing captured row|Invalid page padding|Full page is not ready|Missing live font: .*|Live typesetting timed out|Mismatched live result|Unexpected live context response|Truncated binary live frame|Invalid live frame.*|Unknown frame kind|Paragraph request too large|Live request mailbox timed out|Live engine not started)$/,'check','layout'],
];
/** -> {code, tone, values, raw}; code is null for a reason this table does not know (shown as written). */
export function explainReason(reason){
  const raw=String(reason??'').trim();
  if(!raw)return null;
  for(const [pattern,tone,name,values] of RULES){const match=pattern.exec(raw);if(match)return {code:tone+'.'+name,tone,values:values?.(match)||{},raw};}
  return {code:null,tone:'full',values:{},raw};
}
/** Reason codes the interface must have sentences for. */
export const REASON_CODES=[...new Set(RULES.map(([,tone,name])=>tone+'.'+name))];
