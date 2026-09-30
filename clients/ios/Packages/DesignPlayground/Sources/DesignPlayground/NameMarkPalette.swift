import DesignSystem
import SwiftUI

internal enum NameMarkPalette {
    private static let colors: [Color] = [
        .popsAccent, .popsWarning, .popsSuccess, .popsDestructive,
    ]

    internal static func color(for name: String) -> Color {
        colors[index(for: name)]
    }

    internal static func index(for name: String) -> Int {
        let seed = name.unicodeScalars.reduce(0) {
            ($0 &* 31 &+ Int($1.value)) % 100_003
        }
        return seed % colors.count
    }
}
