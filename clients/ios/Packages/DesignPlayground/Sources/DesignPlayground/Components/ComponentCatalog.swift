import DesignSystem
import SwiftUI

/// Every DesignSystem primitive, in every shape it comes in.
///
/// The synopses are taken from each primitive's own docstring rather than
/// rewritten, so this sheet cannot come to describe a component differently
/// from the component. Where a docstring argues for a decision — why the
/// outline is the default weight, why the action bar's background is a
/// material and not a token — the argument is the part worth carrying, because
/// it is what stops the next person from "fixing" it.
@MainActor
internal enum ComponentCatalog {
    static let all: [DesignComponent] = [
        button, card, row, actionBar, textField, statusHeader, divider, states,
    ]

    private static let button = DesignComponent(
        id: "pops-button",
        name: "PopsButton",
        synopsis:
            "Two weights. Outline is the default — the weight a screen can carry several of without any claiming to "
            + "be the one to press. Filled is for the one action a screen exists to offer, at most one per screen.",
        states: [
            DesignState("prominent", "Prominent") {
                PopsButton("Photograph a receipt", prominence: .prominent) {}
            },
            DesignState("prominent-disabled", "Prominent, disabled") {
                PopsButton("Photograph a receipt", prominence: .prominent) {}.disabled(true)
            },
            DesignState("standard", "Standard") {
                PopsButton("Pair") {}
            },
            DesignState("standard-disabled", "Standard, disabled") {
                PopsButton("Pair") {}.disabled(true)
            },
        ]
    )

    private static let card = DesignComponent(
        id: "pops-card",
        name: "PopsCard",
        synopsis:
            "A raised container that owns its surface, padding and radius so no screen picks its own, and stretches "
            + "to the available width so a column of cards lines up.",
        states: [
            DesignState.standard {
                PopsCard {
                    VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                        Text("August").font(.popsTitle).foregroundStyle(Color.popsForeground)
                        PopsRow(title: "Groceries", subtitle: "12 transactions")
                    }
                }
            },
            DesignState("nested", "Holding rows") {
                PopsCard {
                    VStack(spacing: PopsSpacing.zero) {
                        PopsRow(title: "Everyday", subtitle: "ANZ")
                        PopsDivider()
                        PopsRow(title: "Emergency fund", subtitle: "Up")
                    }
                }
            },
        ]
    )

    private static let row = DesignComponent(
        id: "pops-row",
        name: "PopsRow",
        synopsis:
            "A headline, an optional supporting line, optional trailing content. Draws no background of its own so "
            + "it composes inside a card, a List, or straight onto the background.",
        states: [
            DesignState.standard {
                VStack(spacing: PopsSpacing.zero) {
                    PopsRow(title: "Coffee", subtitle: "Yesterday")
                    PopsRow(title: "Rent", subtitle: "1 August") {
                        Text("−$1,240.00")
                            .font(.popsMonospaced)
                            .foregroundStyle(Color.popsDestructive)
                    }
                }
            },
            DesignState("no-subtitle", "Title only") {
                PopsRow(title: "Everything else")
            },
            DesignState("truncating", "Title that truncates") {
                PopsRow(
                    title: "Owner-occupier variable rate, Kensington",
                    subtitle: "Commonwealth Bank of Australia"
                ) {
                    Text("−$614,809.00")
                        .font(.popsMonospaced)
                        .foregroundStyle(Color.popsDestructive)
                }
            },
        ]
    )

    private static let actionBar = DesignComponent(
        id: "pops-action-bar",
        name: "PopsActionBar",
        synopsis:
            "The actions a screen ends in, attached with .safeAreaInset so content scrolls under it. Its background "
            + "is a system material rather than a token, deliberately: a material is what makes content visibly pass "
            + "behind the bar, which a flat fill cannot do.",
        states: [
            DesignState.standard {
                ScrollView {
                    VStack(alignment: .leading, spacing: PopsSpacing.md) {
                        ForEach(0..<12, id: \.self) { index in
                            PopsRow(title: "Row \(index)", subtitle: "Something under it")
                        }
                    }
                    .padding(PopsSpacing.lg)
                }
                .safeAreaInset(edge: .bottom) {
                    PopsActionBar {
                        PopsButton("Photograph a receipt", prominence: .prominent) {}
                    }
                }
            }
        ]
    )

    private static let textField = DesignComponent(
        id: "pops-text-field",
        name: "PopsTextField",
        synopsis:
            "A labelled field with an optional note under it. A hint says the value may want attention; a problem "
            + "says it is not usable as it stands, and the two borrow their colours from PopsStatusHeader so a field "
            + "and a banner agree.",
        states: [
            DesignState.standard { FieldSample(note: nil) },
            DesignState("hint", "With a hint") {
                FieldSample(note: .hint("Most receipts round to the nearest 5c."))
            },
            DesignState("problem", "With a problem") {
                FieldSample(note: .problem("Enter an amount before saving."))
            },
        ]
    )

    private static let statusHeader = DesignComponent(
        id: "pops-status-header",
        name: "PopsStatusHeader",
        synopsis:
            "The banner at the top of a screen that reports what happened. Four tones: it worked, it needs a "
            + "person, it failed, or it is a fact the reader did not cause.",
        states: PopsStatusHeader.Tone.allCases.map { tone in
            DesignState(String(describing: tone), String(describing: tone).capitalized) {
                PopsStatusHeader(
                    tone: tone,
                    title: "Receipt read",
                    message:
                        "Nine lines and a total. Two need a category before this can be saved.",
                    caption: "Photographed 2 minutes ago"
                )
            }
        }
    )

    private static let divider = DesignComponent(
        id: "pops-divider",
        name: "PopsDivider",
        synopsis: "A hairline rule in the separator token, at the width the platform draws one.",
        states: [
            DesignState.standard {
                VStack(spacing: PopsSpacing.md) {
                    Text("Above").font(.popsBody).foregroundStyle(Color.popsForeground)
                    PopsDivider()
                    Text("Below").font(.popsBody).foregroundStyle(Color.popsForeground)
                }
            }
        ]
    )

    private static let states = DesignComponent(
        id: "state-views",
        name: "State views",
        synopsis:
            "The three whole-screen states, which share a body so they cannot drift apart. The error's retry is not "
            + "decoration: without a way to ask again, recovering means force-quitting.",
        states: [
            DesignState("loading", "Loading") {
                LoadingStateView(message: "Loading transactions…")
            },
            DesignState("empty", "Empty") {
                EmptyStateView(message: "No transactions in this period.")
            },
            DesignState("error", "Error") {
                ErrorStateView(message: "Could not reach the server.") {}
            },
            DesignState("error-custom", "Error, custom retry") {
                ErrorStateView(
                    message: "This device is no longer paired.", retryTitle: "Pair again"
                ) {}
            },
        ]
    )
}

/// A field needs somewhere to put what is typed, and a catalogue entry has no
/// model — so the binding lives here, in the smallest view that can hold it.
private struct FieldSample: View {
    let note: PopsFieldNote?
    @State private var text = ""

    var body: some View {
        PopsTextField(
            "Total",
            placeholder: "0.00",
            text: $text,
            keyboard: .decimal,
            note: note
        )
    }
}
