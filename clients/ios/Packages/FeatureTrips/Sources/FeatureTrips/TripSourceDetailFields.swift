import DesignSystem
import SwiftUI

internal struct TripSourceDetailFacts: View {
    internal let title: String
    internal let facts: [TripSourceDetailFact]

    internal var body: some View {
        if !facts.isEmpty {
            VStack(alignment: .leading, spacing: PopsSpacing.md) {
                Text(title).font(.popsHeadline).accessibilityAddTraits(.isHeader)
                PopsCard(appearance: .featured) {
                    TripSourceDetailFactRows(facts: facts)
                }
            }
        }
    }
}

internal struct TripSourceDetailFactRows: View {
    internal let facts: [TripSourceDetailFact]

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            ForEach(Array(facts.enumerated()), id: \.offset) { _, fact in
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    Text(fact.label).font(.popsSectionLabel)
                        .foregroundStyle(Color.popsMutedForeground)
                    Text(fact.value)
                        .font(fact.label == "Reference" ? .popsMonospaced : .popsBody)
                        .foregroundStyle(Color.popsForeground)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
}

internal struct TripSourceDetailReferences: View {
    internal let group: TripSourceDetailReferenceGroup

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            Text(group.title).font(.popsHeadline).accessibilityAddTraits(.isHeader)
            PopsCard(appearance: .featured) {
                VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                    ForEach(Array(group.links.enumerated()), id: \.offset) { _, link in
                        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                            if let label = link.label, !label.isEmpty {
                                Text(label).font(.popsHeadline)
                            }
                            Text(link.uri).font(.popsBody)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
        }
    }
}
