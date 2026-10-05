import AppCore
import Testing

@testable import FeatureEgo

@Suite("Ego tool presentation")
internal struct EgoToolPresentationTests {
    @Test("domain tool names use a human-readable domain label")
    func domainToolLabels() {
        #expect(
            EgoToolPresentation.label(for: "finance.transactions.list", status: .started)
                == "Checking finance"
        )
        #expect(
            EgoToolPresentation.label(for: "finance.transactions.list", status: .finished)
                == "Checked finance"
        )
        #expect(
            EgoToolPresentation.label(for: "finance_transactions_list", status: .started)
                == "Checking finance"
        )
        #expect(
            EgoToolPresentation.label(for: "cerebrum.search", status: .started)
                == "Checking notes"
        )
    }

    @Test("Ego navigation tools keep their purpose label in every status")
    func egoToolLabelsIgnoreStatus() {
        let statuses: [EgoToolStatus] = [.started, .finished, .failed]
        for status in statuses {
            #expect(
                EgoToolPresentation.label(for: "ego_show_entities", status: status)
                    == "Showing results"
            )
            #expect(EgoToolPresentation.label(for: "ego_navigate", status: status) == "Opening")
        }
    }

    @Test("unknown names are humanized without separators")
    func unknownToolNamesAreHumanized() {
        let label = EgoToolPresentation.label(for: "lists.items.add", status: .started)

        #expect(label == "Checking Lists Items Add")
        #expect(!label.contains("."))
        #expect(!label.contains("_"))
    }

    @Test("camel case boundaries are split for unknown names")
    func camelCaseNamesAreHumanized() {
        #expect(
            EgoToolPresentation.label(for: "listsItems.add", status: .started)
                == "Checking Lists Items Add"
        )
    }

    @Test("a failed tool uses failure copy")
    func failedToolUsesFailureCopy() {
        #expect(
            EgoToolPresentation.label(for: "inventory.items.list", status: .failed)
                == "Could not check inventory"
        )
    }

    @Test("an empty tool name uses a neutral activity label")
    func emptyNameUsesWorkingLabel() {
        #expect(EgoToolPresentation.label(for: "", status: .started) == "Working")
        #expect(EgoToolPresentation.label(for: " ._- ", status: .failed) == "Working")
    }
}
