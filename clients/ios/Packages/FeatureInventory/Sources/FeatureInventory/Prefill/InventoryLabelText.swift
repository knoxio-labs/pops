import CoreGraphics
import Foundation

/// Recognized label text in view coordinates, where y increases downward.
internal struct InventoryRecognizedText: Hashable, Sendable {
    internal let transcript: String
    internal let topLeft: CGPoint
    internal let topRight: CGPoint
    internal let bottomRight: CGPoint
    internal let bottomLeft: CGPoint

    fileprivate var trimmedTranscript: String {
        transcript.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    fileprivate var minX: CGFloat {
        min(min(topLeft.x, topRight.x), min(bottomRight.x, bottomLeft.x))
    }

    fileprivate var minY: CGFloat {
        min(min(topLeft.y, topRight.y), min(bottomRight.y, bottomLeft.y))
    }

    fileprivate var maxY: CGFloat {
        max(max(topLeft.y, topRight.y), max(bottomRight.y, bottomLeft.y))
    }

    fileprivate var midpointY: CGFloat { (minY + maxY) / 2 }
}

/// Reconstructs label rows from recognized text without depending on the scanner framework.
internal enum InventoryLabelText {
    /// Orders rows top to bottom and words left to right. A row keeps its first item's
    /// vertical span: later items join only when their midpoint falls inside that span.
    internal static func lines(from items: [InventoryRecognizedText]) -> [String] {
        let ordered = items.filter { !$0.trimmedTranscript.isEmpty }.sorted { $0.minY < $1.minY }
        var rows: [[InventoryRecognizedText]] = []
        for item in ordered {
            if let first = rows.last?.first, (first.minY...first.maxY).contains(item.midpointY) {
                rows[rows.count - 1].append(item)
            } else {
                rows.append([item])
            }
        }
        return rows.map { row in
            row.sorted { $0.minX < $1.minX }.map(\.trimmedTranscript).joined(separator: " ")
        }
    }
}
