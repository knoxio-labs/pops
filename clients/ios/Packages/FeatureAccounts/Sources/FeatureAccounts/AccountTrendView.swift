import AppCore
import DesignSystem
import SwiftUI

/// Twelve months of balance history, as a plain `Path`-based line rather than
/// `Charts`: nothing else in this app draws with that framework yet, and one
/// modest line does not earn introducing it — see this ticket's report.
///
/// The line is decorative — `.accessibilityHidden` — because the sentence
/// beneath it already says what changed and by how much; a sparkline with no
/// axis labels has nothing further to tell VoiceOver.
internal struct AccountTrendView: View {
    internal let history: [AccountBalancePoint]
    internal let color: Color

    private static let height: CGFloat = 64

    internal var body: some View {
        if history.count > 1 {
            GeometryReader { geometry in
                path(in: geometry.size)
                    .stroke(
                        color,
                        style: StrokeStyle(
                            lineWidth: PopsBorder.emphasis, lineCap: .round, lineJoin: .round))
            }
            .frame(height: Self.height)
            .accessibilityHidden(true)
        }
    }

    private func path(in size: CGSize) -> Path {
        let values = history.map(\.balanceMinorUnits)
        let minimum = values.min() ?? 0
        let maximum = values.max() ?? 0
        let range = Double(max(maximum - minimum, 1))

        var path = Path()
        for (index, value) in values.enumerated() {
            let horizontal = size.width * CGFloat(index) / CGFloat(values.count - 1)
            let fraction = Double(value - minimum) / range
            let vertical = size.height * (1 - fraction)
            let point = CGPoint(x: horizontal, y: vertical)
            if index == 0 {
                path.move(to: point)
            } else {
                path.addLine(to: point)
            }
        }
        return path
    }
}
