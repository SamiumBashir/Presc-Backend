# MedEx Medicine Scraper, Cleaner & Importer for DocPresc

This subsystem collects, parses, cleans, deduplicates, and imports Bangladesh national pharmaceutical brand records from MedEx directly into the DocPresc MongoDB database. It supports both **Allopathic** medicines (pages 1 to 846) and **Herbal, Unani & Ayurvedic** traditional medicines (pages 1 to 31).

---

## 🏗️ Architecture & Directory Structure

```text
backend/
├── scripts/
│   └── medex/
│       ├── parse-medex.ts            # Core HTML extraction & Unani/Ayurvedic domain classifier
│       ├── scrape-medex.ts           # Allopathic multi-worker async scraper (pages 1-846)
│       ├── clean-medex.ts            # Allopathic aggregator & deduplicator
│       ├── import-medex.ts           # Allopathic MongoDB bulk importer
│       ├── scrape-medex-herbal.ts    # Herbal/Traditional scraper (pages 1-31)
│       ├── clean-medex-herbal.ts     # Herbal aggregator, deduplicator & Unani/Ayurvedic segregater
│       ├── import-medex-herbal.ts    # Unani, Ayurvedic & Herbal MongoDB bulk importer
│       └── README.md                 # Documentation (this file)
└── data/
    └── medex/
        ├── raw/                      # Allopathic checkpoint & page_<N>.json cache
        ├── raw_herbal/               # Herbal checkpoint & page_<N>.json cache (pages 1-31)
        ├── processed/
        │   ├── medex_brands.json             # Allopathic clean JSON
        │   ├── medex_brands.csv              # Allopathic clean CSV
        │   ├── medex_unani_brands.json       # Unani clean JSON
        │   ├── medex_unani_brands.csv        # Unani clean CSV
        │   ├── medex_ayurvedic_brands.json   # Ayurvedic clean JSON
        │   ├── medex_ayurvedic_brands.csv    # Ayurvedic clean CSV
        │   ├── medex_herbal_supplements.json # Western Herbal/Nutraceuticals JSON
        │   ├── medex_herbal_supplements.csv  # Western Herbal/Nutraceuticals CSV
        │   ├── medex_all_herbal_brands.json  # Complete 31-page combined JSON
        │   └── medex_all_herbal_brands.csv   # Complete 31-page combined CSV
        └── reports/
            ├── scraping_report.json          # Allopathic summary stats
            ├── failed_pages.json             # Allopathic failed pages tracker
            ├── herbal_scraping_report.json   # Herbal/Unani/Ayurvedic summary stats
            └── herbal_failed_pages.json      # Herbal failed pages tracker
```

---

## 🌿 Herbal, Unani & Ayurvedic Pipeline (Pages 1 to 31)

### 1. Scrape Herbal Catalog
Fetches all 31 pages of `https://medex.com.bd/brands?herbal=1` with multi-worker concurrency, 429 backoff, and caching in `data/medex/raw_herbal/`:
```bash
npm run scrape:herbal
```

Custom options:
```bash
# Force re-scrape:
npx tsx scripts/medex/scrape-medex-herbal.ts --force

# Scrape specific page range:
npx tsx scripts/medex/scrape-medex-herbal.ts --start=1 --end=10
```

### 2. Clean, Classify & Segregate Unani and Ayurvedic
Aggregates all cached herbal pages, performs composite deduplication, classifies into **Unani**, **Ayurvedic**, and **Herbal**, and exports separate JSON and CSV files:
```bash
npm run clean:herbal
```

Generated datasets in `data/medex/processed/`:
1. `medex_unani_brands.json` & `.csv`: Unani brands (Hamdard, Green Laboratories, Habbe, Sharbat, Qurs, Majun, Arq, Sufoof, etc.)
2. `medex_ayurvedic_brands.json` & `.csv`: Ayurvedic brands (Vasakarista, Chyabanprash, Asava, Arista, Kwath, Churna, Biocell Ayurvedic, etc.)
3. `medex_herbal_supplements.json` & `.csv`: Western herbal & nutraceuticals (Ginkgo Biloba, Spirulina, Silymarin, CoQ10, Biotin, etc.)
4. `medex_all_herbal_brands.json` & `.csv`: Complete combined catalog with `medicineType` column.

### 3. Import into MongoDB
Safely bulk upserts the traditional medicines into MongoDB matching `(brandName, strength, genericName, manufacturer)` with their true `medicineType: 'Unani' | 'Ayurvedic' | 'Herbal'`:
```bash
# Dry run validation:
npx tsx scripts/medex/import-medex-herbal.ts --dry-run

# Import all herbal/traditional medicines:
npm run import:herbal

# Import only Unani or Ayurvedic:
npx tsx scripts/medex/import-medex-herbal.ts --type=unani
npx tsx scripts/medex/import-medex-herbal.ts --type=ayurvedic
```

---

## 💊 Allopathic Pipeline (Pages 1 to 846)

### 1. Scrape Allopathic Catalog
```bash
npm run scrape:medex
```

### 2. Clean & Deduplicate Allopathic Data
```bash
npm run clean:medex
```

### 3. Import Allopathic Data into Database
```bash
npm run import:medex
```

---

## 📊 Extracted Data Fields

Every record extracted adheres to the schema:

| Field | Description | Example |
|---|---|---|
| `brandName` | Commercial Brand name in Bangladesh | `Achless` / `Adovas` / `5HTP` |
| `strength` | Dosage strength / concentration | `500 mg` / `(100 mg+50 mg)/gm` |
| `genericName` | Active ingredient or formulation | `Habb-e Suranjan` / `Vasakarista` |
| `manufacturer` | Registered pharmaceutical company | `Hamdard Laboratories (WAQF) BD` |
| `dosageForm` | Dosage formulation | `Capsule` / `Syrup` / `Tablet` |
| `medicineType` | Domain category | `Unani` / `Ayurvedic` / `Herbal` |
| `sourcePage` | MedEx pagination page number | `1` to `31` |
| `sourceUrl` | Source URL of the catalog page | `https://medex.com.bd/brands?herbal=1&page=1` |
| `detailUrl` | Direct link to MedEx detail page | `https://medex.com.bd/brands/33659/...` |
