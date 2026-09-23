# FeatureSearch

FeatureSearch owns universal-search presentation shared across pillars. AppCore supplies the vocabulary and per-pillar phase model; feature packages supply their own result rows and filters without importing one another.

`SearchScopeBar` shows All followed by the available pillars, including each pillar's current count or availability state. `SearchSectionChrome` draws the shared header, refinement treatment, loading skeleton and recovery rows around caller-provided results. The caller still owns query composition, pillar models and navigation.
