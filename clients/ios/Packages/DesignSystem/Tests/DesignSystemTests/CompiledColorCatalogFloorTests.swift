import DesignSystemTestSupport
import Testing

/// The floor under `.requiresCompiledColorCatalog`: on the lane that is
/// supposed to compile `Colors.xcassets`, `colorsAreCompiled` must be true.
///
/// `HostToolchainColorSupport.colorsAreCompiled` exists so a `swift build`/
/// `swift test` build system that copies the asset catalogue without
/// compiling it can be told apart from a genuine colour regression, and every
/// colour and rendering suite in this package disables itself rather than
/// report a contradiction the code under test never made. That is the right
/// behaviour on the host toolchain, where the precondition is legitimately
/// false. On iOS, `xcodebuild test` compiles the catalogue either way — see
/// the doc comment on `HostToolchainColorSupport` — so the same precondition
/// failing here is not a toolchain limitation, it is the compiled-asset lane
/// itself producing an uncompiled catalogue, and every suite gated on
/// `.requiresCompiledColorCatalog` would currently be skipping around it in
/// silence rather than running.
///
/// This test carries no disable trait, so on iOS it can only pass or fail —
/// never skip. `#if os(iOS)` keeps it out of the host-toolchain build
/// entirely, the same way `PairingDynamicTypeTests` stays out of a question
/// only iOS can answer, so this adds no new way for the host lane to fail.
#if os(iOS)
    @Suite("Compiled colour catalogue floor")
    internal struct CompiledColorCatalogFloorTests {
        @Test("the lane that must compile Colors.xcassets did")
        func colorsAreCompiledOnTheCompiledAssetLane() {
            #expect(
                HostToolchainColorSupport.colorsAreCompiled,
                """
                colorsAreCompiled is false on iOS, where xcodebuild test always \
                compiles Colors.xcassets. Every colour and rendering assertion \
                gated on .requiresCompiledColorCatalog is skipping right now \
                instead of running — see HostToolchainColorSupport.
                """
            )
        }
    }
#endif
