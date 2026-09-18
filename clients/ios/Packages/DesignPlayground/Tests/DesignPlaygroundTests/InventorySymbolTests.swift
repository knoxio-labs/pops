import Foundation
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
    /// Whether the module ships the custom symbol. An Xcode build compiles the
    /// asset catalogue and the image resolves; SwiftPM's command-line build only
    /// copies the catalogue into the bundle, so there the symbol's own SVG has
    /// to be inside the copied catalogue instead.
    private func existsInModule(_ name: String) -> Bool {
        if resolvesFromModule(name) { return true }
        guard let catalogue = Bundle.module.url(forResource: "Symbols", withExtension: "xcassets")
        else { return false }
        let svg = catalogue.appendingPathComponent("\(name).symbolset/\(name).svg")
        return FileManager.default.fileExists(atPath: svg.path)
    }

    private func resolvesFromModule(_ name: String) -> Bool {
        #if canImport(UIKit)
            UIImage(named: name, in: .module, with: nil) != nil
        #else
            Bundle.module.image(forResource: name) != nil
        #endif
    }

    private func exists(_ name: String) -> Bool {
        #if canImport(UIKit)
            UIImage(systemName: name) != nil
        #else
            NSImage(systemSymbolName: name, accessibilityDescription: nil) != nil
        #endif
    }

    @Test("every SF Symbol in the table exists on this platform")
    func systemNamesResolve() {
        let missing = InventorySymbol.all
            .filter { !$0.symbol.isCustom && !exists($0.symbol.system) }
            .map(\.symbol.system)

        #expect(missing.isEmpty, "not in the SF Symbols catalogue: \(missing)")
    }

    @Test("the check itself can fail, a name that does not exist is reported missing")
    func checkIsNotVacuous() {
        #expect(!exists("inventory.not-a-real-symbol"))
        #expect(!existsInModule("inventory.not-a-real-symbol"))
    }

    @Test("every custom symbol ships in the module's asset catalogue and is not an SF Symbol")
    func customNamesResolveFromTheModule() {
        let custom = InventorySymbol.all.map(\.symbol).filter(\.isCustom)
        let missing = custom.filter { !existsInModule($0.system) }.map(\.system)
        let shadowed = custom.filter { exists($0.system) }.map(\.system)

        #expect(!custom.isEmpty)
        #expect(missing.isEmpty, "not in the module's asset catalogue: \(missing)")
        #expect(shadowed.isEmpty, "custom name collides with an SF Symbol: \(shadowed)")
    }

    @Test("every concept names a Lucide pair for the web client")
    func everyEntryHasALucidePair() {
        #expect(InventorySymbol.all.allSatisfy { !$0.symbol.lucide.isEmpty })
    }

    @Test("open and close are one pair, the same box opened and shut, on both clients")
    func openAndCloseArePaired() {
        #expect(InventorySymbol.close == InventorySymbol(system: "shippingbox", lucide: "Package"))
        #expect(InventorySymbol.open.isCustom)
        #expect(InventorySymbol.open.system == InventorySymbol.close.system + ".open")
        #expect(InventorySymbol.open.lucide == InventorySymbol.close.lucide + "Open")
        #expect(!InventorySymbol.open.system.contains("arrow"))
        #expect(InventorySymbol.close != InventorySymbol.seal)
    }

    @Test("concepts are listed once each")
    func namesAreUnique() {
        let names = InventorySymbol.all.map(\.name)

        #expect(Set(names).count == names.count)
    }
}
