import Testing

@testable import FeatureEgo

@Suite("Ego welcome prompts")
internal struct EgoWelcomePromptTests {
    @Test("offers four distinct prompts grounded in Pops domains")
    func promptsAreDistinctAndUseful() {
        let prompts = EgoWelcomePrompt.suggestions

        #expect(
            prompts.map(\.id) == [
                "recent-activity", "find-item", "recent-purchase", "media-library",
            ])
        #expect(Set(prompts.map(\.title)).count == 4)
        #expect(Set(prompts.map(\.prompt)).count == 4)
        #expect(
            prompts.allSatisfy {
                !$0.title.isEmpty && !$0.detail.isEmpty && !$0.prompt.isEmpty && !$0.symbol.isEmpty
            })
        let copy = prompts.map(\.prompt).joined(separator: " ").lowercased()
        #expect(copy.contains("spending"))
        #expect(copy.contains("inventory"))
        #expect(copy.contains("purchases"))
        #expect(copy.contains("media"))
    }
}
