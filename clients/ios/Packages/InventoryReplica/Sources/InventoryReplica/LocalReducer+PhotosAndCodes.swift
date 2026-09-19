import AppCore
import GRDB

/// `item-photos.ts` and the code lookups `item-code.ts` makes.
///
/// The phone keeps photos as an ordered list, not the server's `position`
/// column. The server orders by position and breaks a tie in insertion
/// order, so a photo attached at a position an existing photo already holds
/// lands after it; with dense positions that is index `position + 1`.
extension LocalReducer {
    func attachPhoto(itemId: String, sha256: String, position: Int) throws -> Written {
        try requireHash(sha256)
        guard position >= 0 else { throw refusal(.invalid, "a photo position is at least 0") }
        let before = try liveItem(itemId)
        var after = before
        let index = min(position + 1, before.photos.count)
        after.photos.insert(StoredPhoto(sha256: sha256, caption: nil), at: index)
        return try sideEffect(before, to: after, kind: "photo_added")
    }

    func removePhoto(itemId: String, sha256: String) throws -> Written {
        try requireHash(sha256)
        let before = try liveItem(itemId)
        var after = before
        after.photos.removeAll { $0.sha256 == sha256 }
        guard after.photos.count != before.photos.count else { return unchanged(before) }
        return try sideEffect(before, to: after, kind: "photo_removed")
    }

    /// Every current photo must be named and nothing else, or the op is
    /// `invalid`: a partial list would silently drop the photos it left out.
    func reorderPhotos(itemId: String, sha256s: [String]) throws -> Written {
        guard !sha256s.isEmpty else { throw refusal(.invalid, "name at least one photo") }
        for sha256 in sha256s { try requireHash(sha256) }
        let before = try liveItem(itemId)
        guard Set(before.photos.map(\.sha256)) == Set(sha256s) else {
            throw refusal(.invalid, "reorderPhotos must name exactly the item's current photos")
        }
        let position = Dictionary(
            sha256s.enumerated().map { ($1, $0) }, uniquingKeysWith: { _, last in last })
        let ordered = before.photos.enumerated().sorted { lhs, rhs in
            let left = (position[lhs.element.sha256] ?? 0, lhs.offset)
            let right = (position[rhs.element.sha256] ?? 0, rhs.offset)
            return left < right
        }
        var after = before
        after.photos = ordered.map(\.element)
        return try sideEffect(before, to: after, kind: "edited")
    }

    /// The other item holding `code`, case-insensitively. A tombstone still
    /// counts: the server's index is not partial, so a sticker stays with
    /// whichever item last wore it.
    func codeHolder(_ code: String, excluding id: String) throws -> (id: String, name: String)? {
        guard
            let row = try Row.fetchOne(
                db,
                sql: "SELECT id, name FROM item WHERE code = ? COLLATE NOCASE AND id <> ? LIMIT 1",
                arguments: [code, id])
        else { return nil }
        return (try row.decode(forColumn: "id"), try row.decode(forColumn: "name"))
    }

    /// The next free code keeping the stem (`B412` to `B413`), trying up to
    /// 1000 candidates, or nil when `code` has no trailing digits
    /// (`suggestNextCode`).
    func suggestedCode(after code: String, excluding id: String) throws -> String? {
        let digits = String(code.reversed().prefix { ("0"..."9").contains($0) }.reversed())
        guard !digits.isEmpty, var number = Int(digits) else { return nil }
        let stem = String(code.dropLast(digits.count))
        for _ in 0..<1000 {
            number += 1
            let padded = String(number)
            let candidate =
                stem + String(repeating: "0", count: max(0, digits.count - padded.count)) + padded
            if try codeHolder(candidate, excluding: id) == nil { return candidate }
        }
        return nil
    }

    private func requireHash(_ sha256: String) throws {
        let isHash =
            sha256.utf8.count == 64
            && sha256.utf8.allSatisfy { (48...57).contains($0) || (97...102).contains($0) }
        guard isHash else {
            throw refusal(.invalid, "a sha256 is 64 lowercase hex characters")
        }
    }
}
