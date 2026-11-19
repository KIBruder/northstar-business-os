// Deterministische Offline-Basisanalyse. Keine KI, kein Webzugriff, keine Verkaufsprognose.
export function analyzeProductLocally(product) {
  const p = product || {};
  const gaps = [];
  if (!p.url) gaps.push('Produktlink fehlt');
  if (!p.sourceUrl) gaps.push('Keine unabhängige Produktquelle hinterlegt');
  if (p.price === null || p.price === undefined || p.price === '') gaps.push('Preis fehlt oder ist nicht bestätigt');
  if (!p.description) gaps.push('Produktbeschreibung und technische Merkmale fehlen');
  if (!p.merchant) gaps.push('Händler / Plattform fehlt');

  const fields = [p.name, p.url, p.sourceUrl,
    p.price !== null && p.price !== undefined && p.price !== '' ? String(p.price) : '',
    p.description, p.merchant];
  const filled = fields.filter(Boolean).length;
  const score = Math.round(filled / fields.length * 100);
  const name = String(p.name || 'Dieses Produkt').trim();
  const description = String(p.description || '').trim();
  const firstBenefit = description
    ? description.split(/[.!?\n]/).map(x => x.trim()).filter(Boolean)[0]
    : null;

  return {
    type: 'local-rules-v1',
    score,
    fieldsFilled: filled,
    fieldsTotal: fields.length,
    summary: `Die Basisanalyse hat ${filled} von 6 Datenfeldern erkannt. Der Wert ${score}/100 beschreibt nur die Datenvollständigkeit. Er ist keine Absatz- oder Erfolgsprognose.`,
    angles: [
      firstBenefit ? `Nutzenorientiert: ${firstBenefit}` : `Nutzenorientiert: Welches konkrete Problem löst ${name}?`,
      `Alltagssituation: Wann und für wen ist ${name} besonders hilfreich?`,
      `Kaufentscheidung: Welche belegbaren Eigenschaften unterscheiden ${name} von Alternativen?`
    ],
    hooks: [
      `Das solltest du vor dem Kauf von ${name} wissen`,
      `Für wen lohnt sich ${name} wirklich?`,
      `Diese 3 Punkte würde ich bei ${name} zuerst prüfen`
    ],
    gaps
  };
}
