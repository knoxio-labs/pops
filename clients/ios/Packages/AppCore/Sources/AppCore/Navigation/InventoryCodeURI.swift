import Foundation

/// Reads an Inventory code link, preserving its code's spelling. Only an
/// authority is allowed; paths, credentials, ports, queries and fragments
/// are not part of the `pops-i://<CODE>` contract.
public func parseInventoryCodeURI(_ raw: String) -> String? {
    let prefix = "pops-i://"
    guard raw.hasPrefix(prefix) else { return nil }
    let encoded = String(raw.dropFirst(prefix.count))
    guard !encoded.isEmpty,
        !encoded.contains(where: { $0.isWhitespace || "/?#@:[]".contains($0) }),
        let code = encoded.removingPercentEncoding,
        !code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    else { return nil }
    return code
}

/// Resolves a code link against the current Inventory replica. Unknown and
/// deleted codes return nil; external identifiers never substitute for a code.
public func resolveInventoryCodeURI(_ raw: String, store: any InventoryStore) async -> PopsURI? {
    guard let code = parseInventoryCodeURI(raw) else { return nil }
    let query = InventoryQuery { source in source.inventoryItem(withCode: code)?.id }
    for await id in store.observe(query) {
        return id.map { PopsURI(pillar: "inventory", type: "item", id: $0) }
    }
    return nil
}
