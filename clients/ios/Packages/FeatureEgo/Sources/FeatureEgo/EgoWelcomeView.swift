import DesignSystem
import SwiftUI

internal struct EgoWelcomePrompt: Hashable, Identifiable, Sendable {
    internal let id: String
    internal let title: String
    internal let detail: String
    internal let symbol: String
    internal let prompt: String

    internal static let suggestions = [
        EgoWelcomePrompt(
            id: "recent-activity",
            title: "Review recent activity",
            detail: "A quick look at recent purchases and spending",
            symbol: "chart.xyaxis.line",
            prompt: "Summarize my recent purchases and spending."
        ),
        EgoWelcomePrompt(
            id: "find-item",
            title: "Find an item",
            detail: "Search items, containers, and locations",
            symbol: "shippingbox",
            prompt: "Help me find an item in my inventory."
        ),
        EgoWelcomePrompt(
            id: "recent-purchase",
            title: "Check a purchase",
            detail: "Find a receipt or purchase detail",
            symbol: "receipt",
            prompt: "Help me find a recent purchase or receipt."
        ),
        EgoWelcomePrompt(
            id: "media-library",
            title: "Find something to watch",
            detail: "Explore movies and shows in my library",
            symbol: "play.rectangle",
            prompt: "Find a movie or show in my media library."
        ),
    ]
}

@MainActor
internal struct EgoWelcomeView: View {
    internal let onChoose: (EgoWelcomePrompt) -> Void

    var body: some View {
        GeometryReader { geometry in
            ScrollView {
                VStack(spacing: PopsSpacing.xl) {
                    Spacer(minLength: PopsSpacing.lg)
                    welcome
                    VStack(spacing: PopsSpacing.sm) {
                        ForEach(EgoWelcomePrompt.suggestions) { suggestion in
                            EgoWelcomePromptCard(suggestion: suggestion, onChoose: onChoose)
                        }
                    }
                    Spacer(minLength: PopsSpacing.lg)
                }
                .padding(.horizontal, PopsSpacing.lg)
                .padding(.vertical, PopsSpacing.xl)
                .frame(maxWidth: .infinity)
                .frame(minHeight: geometry.size.height)
            }
            .scrollIndicators(.hidden)
        }
        .accessibilityIdentifier("ego-welcome")
    }

    private var welcome: some View {
        VStack(spacing: PopsSpacing.md) {
            EgoLauncherIcon()
            Text("How can I help?")
                .font(.popsTitle)
                .foregroundStyle(Color.popsForeground)
                .multilineTextAlignment(.center)
            Text("Ask about your finances, purchases, inventory, or media.")
                .font(.popsBody)
                .foregroundStyle(Color.popsMutedForeground)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity)
        .padding(.bottom, PopsSpacing.md)
    }
}

@MainActor
internal struct EgoWelcomePromptCard: View {
    internal let suggestion: EgoWelcomePrompt
    internal let onChoose: (EgoWelcomePrompt) -> Void

    var body: some View {
        Button {
            onChoose(suggestion)
        } label: {
            PopsCard {
                HStack(spacing: PopsSpacing.md) {
                    Image(systemName: suggestion.symbol)
                        .font(.popsTitle)
                        .foregroundStyle(Color.popsAccent)
                        .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
                        .accessibilityHidden(true)

                    VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                        Text(suggestion.title)
                            .font(.popsHeadline)
                            .foregroundStyle(Color.popsForeground)
                        Text(suggestion.detail)
                            .font(.popsCaption)
                            .foregroundStyle(Color.popsMutedForeground)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)

                    Image(systemName: "chevron.right")
                        .font(.popsCaption.weight(.semibold))
                        .foregroundStyle(Color.popsMutedForeground)
                        .accessibilityHidden(true)
                }
            }
            .contentShape(RoundedRectangle(cornerRadius: PopsRadius.card))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(suggestion.title). \(suggestion.detail)")
        .accessibilityHint("Starts a conversation with Ego.")
        .accessibilityIdentifier("ego-welcome-suggestion-\(suggestion.id)")
    }
}
