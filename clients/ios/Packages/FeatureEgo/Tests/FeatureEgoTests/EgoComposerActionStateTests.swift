import Testing

@testable import FeatureEgo

@Suite("Ego composer action state")
internal struct EgoComposerActionStateTests {
    @Test("an empty draft disables send")
    func emptyDraftDisablesSend() {
        let state = EgoComposerActionState(
            isStreaming: false,
            isSendAvailable: true,
            draft: " \n ")

        #expect(state.action == .send)
        #expect(state.isDisabled)
    }

    @Test("send availability gates a non-empty draft")
    func availabilityGatesSend() {
        let enabled = EgoComposerActionState(
            isStreaming: false,
            isSendAvailable: true,
            draft: "Hello")
        let unavailable = EgoComposerActionState(
            isStreaming: false,
            isSendAvailable: false,
            draft: "Hello")

        #expect(enabled.action == .send)
        #expect(!enabled.isDisabled)
        #expect(unavailable.action == .send)
        #expect(unavailable.isDisabled)
    }

    @Test("a streaming turn always enables stop")
    func streamingEnablesStop() {
        let state = EgoComposerActionState(
            isStreaming: true,
            isSendAvailable: false,
            draft: "")

        #expect(state.action == .stop)
        #expect(!state.isDisabled)
    }
}
