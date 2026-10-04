import AppCore
import DesignSystem
import SwiftUI

/// One native card for an entity referenced in an Ego message.
@MainActor
internal struct EgoEntityCardView: View {
    internal let part: EgoEntityPart
    internal let entityRouter: any EntityRouter
    internal let onUnsupported: (String) -> Void

    private let presentation: EgoEntityCardPresentation

    internal init(
        part: EgoEntityPart,
        entityRouter: any EntityRouter,
        onUnsupported: @escaping (String) -> Void
    ) {
        self.part = part
        self.entityRouter = entityRouter
        self.onUnsupported = onUnsupported
        presentation = EgoEntityCardPresentation(part: part)
    }

    var body: some View {
        if presentation.isTappable {
            Button(action: route) {
                card(showsChevron: true)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(presentation.accessibilityLabel)
        } else {
            card(showsChevron: false)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(presentation.accessibilityLabel)
        }
    }

    private func card(showsChevron: Bool) -> some View {
        PopsCard {
            HStack(alignment: .center, spacing: PopsSpacing.md) {
                Image(systemName: presentation.symbolName)
                    .font(.popsTitle)
                    .foregroundStyle(Color.popsMutedForeground)
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    Text(part.title)
                        .font(.popsSubheadline.weight(.semibold))
                        .foregroundStyle(Color.popsForeground)
                        .fixedSize(horizontal: false, vertical: true)

                    if let subtitle = part.subtitle, !subtitle.isEmpty {
                        Text(subtitle)
                            .font(.popsCaption)
                            .foregroundStyle(Color.popsMutedForeground)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }

                Spacer(minLength: PopsSpacing.sm)

                if showsChevron {
                    Image(systemName: "chevron.right")
                        .font(.popsCaption.weight(.semibold))
                        .foregroundStyle(Color.popsMutedForeground)
                        .accessibilityHidden(true)
                }
            }
        }
        .contentShape(RoundedRectangle(cornerRadius: PopsRadius.card))
    }

    private func route() {
        if case .unsupported(let pillar)? = routeEgoEntity(part, router: entityRouter) {
            onUnsupported(pillar)
        }
    }
}

/// Routes one entity part, or returns `nil` when its URI is malformed.
@MainActor
internal func routeEgoEntity(_ part: EgoEntityPart, router: any EntityRouter) -> EntityRouteOutcome?
{
    guard let uri = part.objectURI else { return nil }
    return router.route(uri)
}
