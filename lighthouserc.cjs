module.exports = {
  ci: {
    collect: {
      startServerCommand: 'bash apps/web/scripts/lighthouse-serve.sh',
      startServerReadyPattern: 'ready for connections|Ready in',
      // 8_Phase.md §1.4 item 30: the four PUBLIC pages. /login is
      // intentionally noindex (auth surface — §69) and would fail the SEO
      // gate by design; /privacy stands in as the fourth public route.
      url: [
        'http://localhost:3000/',
        'http://localhost:3000/rentals',
        'http://localhost:3000/map',
        'http://localhost:3000/privacy',
      ],
      numberOfRuns: 3,
      settings: {
        // §68 thresholds are 5 points below local to absorb CI variance
        // (8_Phase.md §5) — enforced in the assertions block below.
        preset: 'desktop',
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.8 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'categories:best-practices': ['error', { minScore: 0.85 }],
        'categories:seo': ['error', { minScore: 0.9 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
