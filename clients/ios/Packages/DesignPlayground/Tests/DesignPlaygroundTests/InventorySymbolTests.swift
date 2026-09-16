import Testing

@testable import DesignPlayground

#if canImport(UIKit)
    import UIKit
#else
    import AppKit
#endif

/// `Image(systemName:)` draws nothing for a name that does not exist, and says
/// nothing about it either. The symbol table is the one place Inventory's
/// glyphs are named, so it is checked against the platform's own catalogue
/// rather than trusted.
@Suite("Inventory symbols")
internal struct InventorySymbolTests {
    private func exists(_ name: String) -> Bool {
        #if canImport(UIKit)
            UIImage(systemName: name) != nil
        #else
            NSImage(systemSymbolName: name, accessibilityDescription: nil) != nil
        #endif
    }

    @Test("every SF Symbol in the table exists on this platform")
    func systemNamesResolve() {
        let missing = InventorySymbol.all.filter { !exists($0.symbol.system) }.map(\.symbol.system)

        #expect(missing.isEmpty, "not in the SF Symbols catalogue: \(missing)")
    }

    @Test("the check itself can fail — a name that does not exist is reported missing")
    func checkIsNotVacuous() {
        #expect(!exists("inventory.not-a-real-symbol"))
    }

    @Test("every concept names a Lucide pair for the web client")
    func everyEntryHasALucidePair() {
        #expect(InventorySymbol.all.allSatisfy { !$0.symbol.lucide.isEmpty })
    }

    @Test("concepts are listed once each")
    func namesAreUnique() {
        let names = InventorySymbol.all.map(\.name)

        #expect(Set(names).count == names.count)
    }
}
