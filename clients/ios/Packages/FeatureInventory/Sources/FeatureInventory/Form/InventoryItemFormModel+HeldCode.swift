import AppCore

/// A typed code someone else already wears (POPS-4063): who holds it, and a
/// free code to wear instead, one tap away.
extension InventoryItemFormModel {
    /// Looks the current code up in the replica, and when someone holds it
    /// finds a free one to offer. Works offline, which is the only check an
    /// offline create gets.
    internal func checkCode() async {
        guard let code = draft.code.normalized else {
            draft.code.heldBy = nil
            freeCode = nil
            return
        }
        let holder = await self.holder(of: code)
        guard draft.code.normalized == code, !Task.isCancelled else { return }
        draft.code.heldBy = holder?.name
        guard holder != nil else {
            freeCode = nil
            return
        }
        let offer = await freeCode(after: code)
        guard draft.code.normalized == code, !Task.isCancelled else { return }
        freeCode = offer
    }

    /// Puts the offered free code in the field; the field's own check then
    /// confirms it.
    internal func useFreeCode() {
        guard let freeCode else { return }
        codeChanged(to: freeCode)
        draft.code.heldBy = nil
        self.freeCode = nil
    }

    func holder(of code: String) async -> InventoryItem? {
        for await found in store.observe(
            InventoryItemFormContext.holder(of: code, excluding: draft.id))
        {
            return found
        }
        return nil
    }

    /// The suggester's first code nobody on this phone holds when online,
    /// otherwise the next code after `code` keeping its stem that this
    /// phone's replica shows free.
    func freeCode(after code: String) async -> String? {
        if !isOffline,
            let suggestions = try? await suggester.suggest(draft.trimmedName, draft.typeKey, code)
        {
            for candidate in suggestions where await holder(of: candidate) == nil {
                return candidate
            }
        }
        for candidate in InventoryCodeSequence.successors(of: code)
        where await holder(of: candidate) == nil {
            return candidate
        }
        return nil
    }
}

/// The codes after one keeping its stem and width (`B412`, `B413`, …), the
/// order the server's `suggestNextCode` tries them in.
internal enum InventoryCodeSequence {
    internal static func successors(of code: String, limit: Int = 1000) -> [String] {
        let digits = String(code.reversed().prefix(while: \.isASCIIDigit).reversed())
        guard !digits.isEmpty, let start = Int(digits) else { return [] }
        let stem = String(code.dropLast(digits.count))
        return (1...limit).map { offset in
            let number = String(start + offset)
            return stem + String(repeating: "0", count: max(0, digits.count - number.count))
                + number
        }
    }
}

extension Character {
    fileprivate var isASCIIDigit: Bool { ("0"..."9").contains(self) }
}
