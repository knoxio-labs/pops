/// Which waiting items a newly shipped type covers, and what the queue makes
/// of them.
///
/// The rule has to work on what an untyped item actually has. It has no
/// fields, so nothing structured can be compared; all there is to go on is the
/// name somebody typed and the note they wrote. So a type carries the words
/// that say an item is one of these, and a word is matched whole.
///
/// Matching whole words rather than substrings is the difference between
/// offering a Table type for a tablecloth and not, and a suggestion that is
/// wrong once is one nobody reads again.
internal enum InventoryTypeArrival {
    /// The waiting items a type covers, in the order they were given.
    ///
    /// Only items still waiting are offered: one already typed has left, a
    /// discarded one stopped counting, and one kept untyped on purpose was
    /// already answered and must not be asked again.
    internal static func covered(
        by type: InventoryItemType,
        in items: [InventoryUntypedItem]
    ) -> [InventoryUntypedItem] {
        items.filter { $0.isWaiting && matches(type, $0) }
    }

    /// Whether one item reads as this type, ignoring whether it is waiting.
    internal static func matches(_ type: InventoryItemType, _ candidate: InventoryUntypedItem)
        -> Bool
    {
        let vocabulary = words(in: candidate.item.name).union(words(in: candidate.note))
        return type.terms.contains { vocabulary.contains($0.lowercased()) }
    }

    /// What a prompt says it found. The type's name is carried by the screen,
    /// so this is only the count and what it is counting.
    internal static func summary(covered: Int, waiting: Int) -> String {
        guard covered > 0 else { return "Nothing waiting looks like one" }
        let subject = covered == 1 ? "1 of the" : "\(covered) of the"
        return "\(subject) \(waiting) waiting look like one"
    }

    private static func words(in text: String) -> Set<String> {
        Set(text.lowercased().split { !$0.isLetter && !$0.isNumber }.map(String.init))
    }
}

/// The things waiting for a type, separated from the things that have stopped
/// waiting on purpose.
///
/// Two lists rather than one with a flag, because they are asked different
/// questions: the first is work a deploy can clear, and the second never will
/// be and should not read as a backlog.
internal enum InventoryWaitingQueue {
    internal static func waiting(in items: [InventoryUntypedItem]) -> [InventoryUntypedItem] {
        items.filter(\.isWaiting)
    }

    /// Items somebody said nothing will ever share. Still untyped, no longer
    /// waiting. A discarded one is not shown here either: it stopped counting.
    internal static func kept(in items: [InventoryUntypedItem]) -> [InventoryUntypedItem] {
        items.filter { $0.isKeptUntyped && $0.item.lifecycle == .active }
    }

    /// The line the queue heads itself with. Says the number and what it is
    /// the number of, because "11" above a list of things is a count of the
    /// list, and this one is not.
    internal static func summary(for items: [InventoryUntypedItem]) -> String {
        switch waiting(in: items).count {
        case 0: "Nothing waiting for a type"
        case 1: "1 thing waiting for a type"
        case let count: "\(count) things waiting for a type"
        }
    }

    /// What is left after a review, said as the queue would say it.
    internal static func remaining(
        in items: [InventoryUntypedItem],
        accepted: Set<String>
    ) -> [InventoryUntypedItem] {
        waiting(in: items).filter { !accepted.contains($0.id) }
    }
}
