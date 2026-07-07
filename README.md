# Silver Macro Terminal

Dark UI dashboard for silver macro metrics against USD, gold, RUB and CNY.

## Environments

- Development: `/?env=development`
- Staging: `/?env=staging`
- Production: `/?env=production`

Each environment changes refresh cadence and visible release-channel metadata. The app uses live browser-side providers and falls back to a static market snapshot when an upstream API is unavailable.

## Data Sources

- Metals: `https://api.gold-api.com/price/XAG` and `https://api.gold-api.com/price/XAU`
- FX: `https://open.er-api.com/v6/latest/USD`

## Local Run

```bash
python3 -m http.server 4173
```

Open `http://127.0.0.1:4173/?env=development`.

## Continue

