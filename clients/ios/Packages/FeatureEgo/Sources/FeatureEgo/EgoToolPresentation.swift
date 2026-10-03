import AppCore
import Foundation

/// Human-readable copy for a gateway tool activity.
internal enum EgoToolPresentation {
    static func label(for toolName: String, status: EgoToolStatus) -> String {
        let words = splitWords(in: toolName)
        guard let firstWord = words.first else { return "Working" }

        let normalizedName = words.map { $0.lowercased() }.joined(separator: "_")
        switch normalizedName {
        case "ego_show_entities":
            return "Showing results"
        case "ego_navigate":
            return "Opening"
        default:
            break
        }

        let noun: String?
        switch firstWord.lowercased() {
        case "finance":
            noun = "finance"
        case "purchases":
            noun = "purchases"
        case "inventory":
            noun = "inventory"
        case "media":
            noun = "media"
        case "cerebrum":
            noun = "notes"
        default:
            noun = nil
        }

        let prefix = statusPrefix(for: status)
        if let noun {
            return "\(prefix) \(noun)"
        }

        let humanizedName = words.map { $0.lowercased().capitalized }.joined(separator: " ")
        return "\(prefix) \(humanizedName)"
    }

    private static func statusPrefix(for status: EgoToolStatus) -> String {
        switch status {
        case .started:
            "Checking"
        case .finished:
            "Checked"
        case .failed:
            "Could not check"
        }
    }

    private static func splitWords(in name: String) -> [String] {
        let characters = Array(name)
        var words: [String] = []
        var current = ""

        for index in characters.indices {
            let character = characters[index]
            if character == "." || character == "_" || character == "-" || character.isWhitespace {
                appendCurrentWord()
                continue
            }

            let previous = current.last
            let next = index + 1 < characters.count ? characters[index + 1] : nil
            let followsLowercaseOrNumber =
                previous.map { $0.isLowercase || $0.isNumber } ?? false
            let endsAnAcronym =
                previous?.isUppercase == true && character.isUppercase && next?.isLowercase == true

            if character.isUppercase && followsLowercaseOrNumber || endsAnAcronym {
                appendCurrentWord()
            }
            current.append(character)
        }

        appendCurrentWord()
        return words

        func appendCurrentWord() {
            guard !current.isEmpty else { return }
            words.append(current)
            current = ""
        }
    }
}
