import Testing

@testable import DesignPlayground

@Suite("Launch stage")
@MainActor
internal struct LaunchStageTests {
    private let surfaceName = InventoryCreationSurfaces.createID.description

    @Test func opensTheNamedState() throws {
        let stage = try #require(
            LaunchStage.named(in: ["app", "-surface", surfaceName, "-state", "edit"]))
        #expect(stage.surface.id == InventoryCreationSurfaces.createID)
        #expect(stage.stateID == "edit")
    }

    @Test func opensTheOpeningStateWithoutAStateArgument() throws {
        let stage = try #require(LaunchStage.named(in: ["app", "-surface", surfaceName]))
        #expect(stage.stateID == InventoryCreationSurfaces.create.openingState?.id)
    }

    @Test func ignoresAnUnknownSurface() {
        #expect(LaunchStage.named(in: ["app", "-surface", "inventory/nowhere"]) == nil)
    }

    @Test func ignoresAnUnknownState() {
        #expect(
            LaunchStage.named(in: ["app", "-surface", surfaceName, "-state", "nowhere"]) == nil)
    }

    @Test func ignoresAFlagWithNoValue() {
        #expect(LaunchStage.named(in: ["app", "-surface"]) == nil)
        #expect(LaunchStage.named(in: ["app"]) == nil)
    }

    @Test func aDanglingStateFlagOpensTheOpeningState() throws {
        let stage = try #require(
            LaunchStage.named(in: ["app", "-surface", surfaceName, "-state"]))
        #expect(stage.stateID == InventoryCreationSurfaces.create.openingState?.id)
    }
}
