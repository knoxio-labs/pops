import AppCore

internal struct ReplicaItemPagePredicate {
    private(set) var clauses: [String]
    private(set) var arguments: InventorySQLArguments

    init?(filter: InventoryItemPageFilter, text: String?, isStale: Bool) {
        guard filter.sync != .stale || isStale else { return nil }
        clauses = ["item.deleted_at IS NULL"]
        arguments = []
        appendLifecycle(filter)
        appendContainers(filter)
        appendPlacement(filter.placement)
        appendAccess(filter.access)
        appendType(filter.typeKey)
        appendQuantity(filter.quantityGreaterThanOne)
        appendMissing(filter.missing)
        appendSync(filter.sync)
        appendExclusions(filter)
        appendSearch(text)
    }

    var sql: String {
        clauses.joined(separator: " AND ")
    }

    private mutating func appendLifecycle(_ filter: InventoryItemPageFilter) {
        if !filter.includeInactive { clauses.append("item.lifecycle = 'active'") }
    }

    private mutating func appendContainers(_ filter: InventoryItemPageFilter) {
        if filter.excludeContainers { clauses.append("item.is_container = 0") }
        if filter.excludeContained { clauses.append("item.placement_kind <> 'container'") }
    }

    private mutating func appendPlacement(_ placement: InventoryItemPagePlacement) {
        switch placement {
        case .any: break
        case .hand: clauses.append("item.placement_kind = 'hand'")
        case .location: clauses.append("item.placement_kind = 'location'")
        case .container: clauses.append("item.placement_kind = 'container'")
        }
    }

    private mutating func appendAccess(_ access: InventoryItemPageAccess) {
        switch access {
        case .any: break
        case .open: clauses.append("item.access = 'open'")
        case .closed: clauses.append("item.access = 'closed'")
        }
    }

    private mutating func appendType(_ typeKey: String?) {
        guard let typeKey else { return }
        clauses.append(
            """
            (item.type_key = ? OR item.type_id IN (
                WITH RECURSIVE matching_types(id, parent_id) AS (
                    SELECT id, parent_id FROM catalogue_type
                    WHERE revision = (SELECT catalogue_revision FROM sync_meta WHERE id = 1)
                      AND key = ?
                    UNION
                    SELECT child.id, child.parent_id FROM catalogue_type AS child
                    JOIN matching_types AS parent ON child.parent_id = parent.id
                    WHERE child.revision = (
                        SELECT catalogue_revision FROM sync_meta WHERE id = 1
                    )
                )
                SELECT id FROM matching_types
            ))
            """)
        arguments += [typeKey, typeKey]
    }

    private mutating func appendQuantity(_ quantityGreaterThanOne: Bool) {
        if quantityGreaterThanOne { clauses.append("item.quantity > 1") }
    }

    private mutating func appendMissing(_ missing: InventoryItemPageMissing) {
        switch missing {
        case .none: break
        case .type:
            clauses.append(
                """
                item.type_key IS NULL AND (
                    item.type_id IS NULL OR NOT EXISTS (
                        SELECT 1 FROM catalogue_type
                        WHERE revision = (SELECT catalogue_revision FROM sync_meta WHERE id = 1)
                          AND id = item.type_id
                    )
                )
                """)
        case .code: clauses.append("item.code IS NULL")
        case .photo: clauses.append("json_array_length(item.photos) = 0")
        }
    }

    private mutating func appendSync(_ sync: InventoryItemPageSync) {
        switch sync {
        case .any: break
        case .waiting:
            clauses.append(
                """
                EXISTS (
                    SELECT 1 FROM mutation_log
                    WHERE entity_kind = 'item' AND entity_id = item.id
                      AND state IN ('queued', 'sending', 'deferred')
                )
                """)
        case .needsAttention:
            clauses.append(
                """
                EXISTS (
                    SELECT 1 FROM repair
                    WHERE entity_kind = 'item' AND entity_id = item.id AND resolved_at IS NULL
                )
                """)
        case .stale:
            clauses.append(
                """
                NOT EXISTS (
                    SELECT 1 FROM mutation_log
                    WHERE entity_kind = 'item' AND entity_id = item.id
                      AND state IN ('queued', 'sending', 'deferred')
                ) AND NOT EXISTS (
                    SELECT 1 FROM repair
                    WHERE entity_kind = 'item' AND entity_id = item.id AND resolved_at IS NULL
                )
                """)
        }
    }

    private mutating func appendExclusions(_ filter: InventoryItemPageFilter) {
        if !filter.excludingIDs.isEmpty {
            let ids = filter.excludingIDs.sorted()
            clauses.append("item.id NOT IN (\(ReplicaPageSQL.placeholders(ids.count)))")
            arguments += ids
        }
        appendPlacementExclusion(filter.excludingPlacement)
    }

    private mutating func appendPlacementExclusion(_ placement: InventoryPlacement?) {
        guard let placement else { return }
        switch placement {
        case .hand:
            clauses.append("item.placement_kind <> 'hand'")
        case .location(let id):
            clauses.append("NOT (item.placement_kind = 'location' AND item.location_id = ?)")
            arguments.append(id)
        case .container(let id):
            clauses.append(
                "NOT (item.placement_kind = 'container' AND item.containing_item_id = ?)")
            arguments.append(id)
        }
    }

    private mutating func appendSearch(_ text: String?) {
        guard let text else { return }
        clauses.append("item.rowid IN (SELECT rowid FROM item_fts WHERE item_fts MATCH ?)")
        arguments += ReplicaSearchIndex.matchValues(for: text)
    }
}
