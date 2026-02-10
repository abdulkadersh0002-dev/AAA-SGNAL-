import { getPairMetadata, getPipSize, getPricePrecision } from '../../src/config/pair-catalog.js';

const samples = [
  'USDJPY',
  'USDJPYC',
  'EURUSD',
  'EURUSDm',
  'XAUUSD',
  'XAUUSD.J26',
  'EUR/USD',
  'EUR:USD',
  'EUR-USD',
  'BTCUSD',
  'BTCEUR',
];

function summarize(symbol) {
  const meta = getPairMetadata(symbol);
  return {
    symbol,
    resolvedPair: meta?.pair ?? null,
    assetClass: meta?.assetClass ?? null,
    base: meta?.base ?? null,
    quote: meta?.quote ?? null,
    pipSize: getPipSize(symbol),
    pricePrecision: getPricePrecision(symbol),
  };
}

const results = samples.map(summarize);
console.log(JSON.stringify({ count: results.length, results }, null, 2));
