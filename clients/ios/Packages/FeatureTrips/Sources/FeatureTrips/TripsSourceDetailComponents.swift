import AppCore
import DesignSystem
import SwiftUI

internal struct TripSourceState {
    internal let axis: String
    internal let value: String
}

internal struct TripsSourceHero: View {
    internal let title: String
    internal let subtitle: String
    internal let symbol: String
    internal let accent: Color
    internal let states: [TripSourceState]

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            HStack(alignment: .top, spacing: PopsSpacing.md) {
                Image(systemName: symbol)
                    .font(.title2)
                    .foregroundStyle(accent)
                    .padding(PopsSpacing.md)
                    .background(accent.opacity(0.14), in: Circle())
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    Text(title)
                        .font(.popsTitle)
                        .foregroundStyle(Color.popsForeground)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(subtitle.isEmpty ? "Trip details" : subtitle)
                        .font(.popsSubheadline)
                        .foregroundStyle(Color.popsMutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: PopsSpacing.zero)
            }
            if !states.isEmpty {
                VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                    ForEach(Array(states.enumerated()), id: \.offset) { _, state in
                        HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.sm) {
                            Text(state.axis.uppercased())
                                .font(.popsSectionLabel)
                                .foregroundStyle(Color.popsMutedForeground)
                            Text(state.value)
                                .font(.popsSubheadline.weight(.semibold))
                                .foregroundStyle(state.value == "Purchased" ? Color.popsSuccess : Color.popsForeground)
                        }
                    }
                }
            }
        }
        .padding(PopsSpacing.xl)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            RoundedRectangle(cornerRadius: PopsRadius.card)
                .fill(
                    LinearGradient(
                        colors: [accent.opacity(0.2), Color.popsSurface],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
        }
        .overlay {
            RoundedRectangle(cornerRadius: PopsRadius.card)
                .stroke(accent.opacity(0.3), lineWidth: PopsBorder.hairline)
        }
    }
}

internal struct TripsSourceDetailCard<Content: View>: View {
    internal let title: String
    internal let symbol: String
    internal let content: Content

    internal init(
        title: String, symbol: String, @ViewBuilder content: () -> Content
    ) {
        self.title = title
        self.symbol = symbol
        self.content = content()
    }

    internal var body: some View {
        PopsCard {
            VStack(alignment: .leading, spacing: PopsSpacing.md) {
                Label(title, systemImage: symbol)
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                content
            }
        }
    }
}

internal struct TripsSourceFact: Identifiable {
    internal let label: String
    internal let value: String

    internal var id: String { "\(label)-\(value)" }
}

internal struct TripsSourceFactsCard: View {
    internal let title: String
    internal let symbol: String
    internal let facts: [TripsSourceFact]

    internal var body: some View {
        if !facts.isEmpty {
            TripsSourceDetailCard(title: title, symbol: symbol) {
                VStack(alignment: .leading, spacing: PopsSpacing.md) {
                    ForEach(facts) { fact in
                        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                            Text(fact.label)
                                .font(.popsCaption)
                                .foregroundStyle(Color.popsMutedForeground)
                            Text(fact.value)
                                .font(.popsBody)
                                .foregroundStyle(Color.popsForeground)
                                .textSelection(.enabled)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
        }
    }
}

internal struct TripsSourceFactLine: View {
    internal let label: String
    internal let value: String
    internal var monospaced = false

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Text(label)
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
            Text(value)
                .font(monospaced ? .popsMonospacedCaption : .popsBody)
                .foregroundStyle(Color.popsForeground)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

internal struct TripsSourceReferencesCard: View {
    internal let title: String
    internal let links: [TripSourceLink]

    internal var body: some View {
        if !links.isEmpty {
            TripsSourceDetailCard(title: title, symbol: "link") {
                VStack(alignment: .leading, spacing: PopsSpacing.md) {
                    ForEach(Array(links.enumerated()), id: \.offset) { _, link in
                        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                            if let label = link.label, !label.isEmpty {
                                Text(label)
                                    .font(.popsSubheadline)
                                    .foregroundStyle(Color.popsForeground)
                            }
                            Text(link.uri)
                                .font(.popsMonospacedCaption)
                                .foregroundStyle(Color.popsMutedForeground)
                                .textSelection(.enabled)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
        }
    }
}

internal struct TripsSourceMomentView: View {
    internal let label: String
    internal let moment: TripSourceMoment

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Text(label.uppercased())
                .font(.popsSectionLabel)
                .foregroundStyle(Color.popsMutedForeground)
            if let day = moment.day {
                Text(day).font(.popsSubheadline.weight(.semibold))
                    .foregroundStyle(Color.popsForeground)
            } else {
                Text("Date not set").font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            if let clock = moment.clock {
                Text(clock).font(.popsMonospaced)
                    .foregroundStyle(Color.popsForeground)
            } else {
                Text("Time not set").font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            if let timeZone = moment.timeZone {
                Text(timeZone).font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                    .textSelection(.enabled)
            }
            if let note = moment.resolutionNote {
                Label(note, systemImage: "exclamationmark.triangle")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsWarning)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
