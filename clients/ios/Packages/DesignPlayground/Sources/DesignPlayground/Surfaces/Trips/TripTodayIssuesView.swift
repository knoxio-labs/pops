import DesignSystem
import SwiftUI

/// Timing findings open only their recorded source identities; absent references have no substitute action.
internal struct TripTodayIssuesView: View {
    internal let state: TripsTodayState
    internal let findings: [TripsTodayFinding]
    internal let open: (TripsTodaySource) -> Void

    internal var body: some View {
        if !findings.isEmpty {
            Section("Timing issues") {
                ForEach(findings) { finding in
                    VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                        Label(finding.message, systemImage: "exclamationmark.triangle")
                            .font(.popsSubheadline)
                            .foregroundStyle(Color.popsDestructive)
                        ForEach(finding.sourceIDs, id: \.self) { sourceID in
                            if let source = tripsTodaySource(state, id: sourceID) {
                                Button(source.name) { open(source) }
                                    .buttonStyle(.borderless)
                                    .font(.popsBody)
                                    .frame(minHeight: PopsSize.touchTarget)
                                    .accessibilityLabel("Open \(source.name)")
                            }
                        }
                    }
                }
            }
        }
    }
}
