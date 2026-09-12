import SwiftUI
import Testing

@testable import DesignPlayground

/// What the inspector reports back about the conditions it is drawing under.
///
/// The flag and the summary were two expressions of one question living in two
/// files, and they disagreed: the summary treated every appearance other than
/// `.light` as "Dark". A surface left following the device therefore reported
/// itself as dark the moment anything else was touched, and one actually set
/// to Light reported no appearance at all.
@Suite("Stage modifications")
@MainActor
internal struct StageModificationTests {
    private static func surface(chrome: Chrome = .navigation) -> DesignSurface {
        DesignSurface(
            id: SurfaceID(area: "test", slug: "surface"),
            title: "Test",
            chrome: chrome,
            states: [DesignState.standard { EmptyView() }]
        )
    }

    private static func settings(
        for surface: DesignSurface,
        _ change: (inout StageSettings) -> Void = { _ in }
    ) -> StageSettings {
        var settings = StageSettings(stateID: "default", chrome: surface.chrome)
        change(&settings)
        return settings
    }

    @Test("a surface opened and left alone reports nothing")
    func untouchedReportsNothing() {
        let surface = Self.surface()

        #expect(Self.settings(for: surface).modifications(from: surface).isEmpty)
        #expect(!Self.settings(for: surface).isModified(from: surface))
    }

    @Test("every axis the inspector can move is reported, alone and under its own name")
    func everyAxisIsReported() {
        let surface = Self.surface(chrome: .navigation)
        let axes: [(String, (inout StageSettings) -> Void)] = [
            ("Dark", { $0.appearance = .dark }),
            ("Light", { $0.appearance = .light }),
            ("AX5", { $0.typeSize = .accessibility5 }),
            ("RTL", { $0.rightToLeft = true }),
            ("Tab bar", { $0.chrome = .tabbed }),
        ]

        for (expected, change) in axes {
            let settings = Self.settings(for: surface, change)

            #expect(
                settings.modifications(from: surface) == [expected],
                "moving one axis reported \(settings.modifications(from: surface))"
            )
            #expect(settings.isModified(from: surface))
        }
    }

    /// The one the bug hid behind: following the device is an *absence* of a
    /// choice, so it must never appear in the summary even when the summary is
    /// non-empty for some other reason.
    @Test("following the device is never reported as an appearance")
    func systemAppearanceIsNeverReported() {
        let surface = Self.surface()
        let settings = Self.settings(for: surface) {
            $0.typeSize = .accessibility5
            $0.rightToLeft = true
        }

        #expect(settings.appearance == .system)
        #expect(settings.modifications(from: surface) == ["AX5", "RTL"])
    }

    @Test("a chrome equal to the surface's own is not a modification")
    func matchingChromeIsNotReported() {
        let surface = Self.surface(chrome: .tabbed)
        let settings = Self.settings(for: surface) { $0.chrome = .tabbed }

        #expect(settings.modifications(from: surface).isEmpty)
    }
}
