# FeatureSearch

FeatureSearch owns universal-search presentation shared across pillars. AppCore supplies the vocabulary and per-pillar phase model; feature packages supply their own result rows and filters without importing one another.

`SearchScopeBar` shows All followed by the available pillars, including each pillar's current count or availability state. `SearchSectionChrome` draws the shared header, refinement treatment, loading skeleton and recovery rows around caller-provided results. The caller still owns query composition, pillar models and navigation.

`SearchRecentsStore` keeps at most six scope-tagged queries in JSON under `search.recents`. Adding a query trims it, deduplicates without regard to case within the same scope and moves it to the front. On first use it can migrate the former Inventory newline list; an existing current value, including corrupt data, prevents that migration from repeating. `SearchRecentsList` filters those recents for the active scope and restores the query and scope together when selected.
