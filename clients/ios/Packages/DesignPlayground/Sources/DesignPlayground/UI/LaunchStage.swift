import Foundation

/// A surface and state named on the command line, opened straight onto its
/// stage so a simulator run can be pointed at one screen without tapping to it.
///
/// Read from `-surface <area/slug>` and an optional `-state <id>`. Anything
/// the catalogue does not know, surface or state, yields nil and the app opens
/// on the Screens list as usual.
internal struct LaunchStage: Identifiable {
    internal let surface: DesignSurface
    internal let stateID: String

    internal var id: String { "\(surface.id)|\(stateID)" }

    @MainActor
    internal static func named(
        in arguments: [String], catalog: [DesignSurface] = Catalog.surfaces
    ) -> LaunchStage? {
        guard let surfaceName = value(of: "-surface", in: arguments),
            let surface = catalog.first(where: { $0.id.description == surfaceName })
        else { return nil }
        guard let stateName = value(of: "-state", in: arguments) else {
            return surface.openingState.map { LaunchStage(surface: surface, stateID: $0.id) }
        }
        guard surface.state(id: stateName) != nil else { return nil }
        return LaunchStage(surface: surface, stateID: stateName)
    }

    private static func value(of flag: String, in arguments: [String]) -> String? {
        guard let index = arguments.firstIndex(of: flag), arguments.indices.contains(index + 1)
        else { return nil }
        return arguments[index + 1]
    }
}
