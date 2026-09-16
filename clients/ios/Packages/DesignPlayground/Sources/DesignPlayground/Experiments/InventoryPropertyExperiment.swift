import SwiftUI

/// How an item says what it can do.
///
/// The four answers are not four layouts — they are four different things for
/// the catalogue to be. Each is staged across the same eleven steps
/// (``InventoryPropertyStaging/steps``) on the same fixtures, because the
/// approaches separate at the edges rather than on a well-filled cable: what
/// creating something uncategorised feels like, what happens to a fact the
/// template never asked for, and whether "every cable that carries at least
/// 30 W" is a search anybody can write.
internal enum InventoryPropertyExperiment {
    @MainActor internal static let all: [DesignExperiment] = [
        DesignExperiment(
            id: "inventory-item-properties",
            question:
                "How should an item record what it can do — fixed templates per category, free typed "
                + "key/values, tags and prose, or a template that suggests without binding?",
            subject: SurfaceID(area: "inventory", slug: "item"),
            variants: [
                DesignVariant(
                    id: "templates",
                    title: "Templates",
                    note:
                        "A category owns a fixed set of fields. Everything agrees; a fact the template "
                        + "never asked for has nowhere to go but the note.",
                    surface: InventoryPropertyStaging.surface {
                        InventoryTemplateVariantView(step: $0)
                    }),
                DesignVariant(
                    id: "properties",
                    title: "Key/value",
                    note:
                        "Any typed key on any item, no categories. Nothing is ever refused, and nothing "
                        + "makes two cables use the same word for length.",
                    surface: InventoryPropertyStaging.surface {
                        InventoryKeyValueVariantView(step: $0)
                    }),
                DesignVariant(
                    id: "tags",
                    title: "Tags and prose",
                    note:
                        "Capabilities in words and a description. Fastest to write, best for the "
                        + "sideboard, and \"at least 30 W\" cannot be asked at all.",
                    surface: InventoryPropertyStaging.surface {
                        InventoryTagsVariantView(step: $0)
                    }),
                DesignVariant(
                    id: "hybrid",
                    title: "Hybrid",
                    note:
                        "The template suggests fields and custom keys are first-class. Two kinds of "
                        + "property on one screen is the cost to look at.",
                    surface: InventoryPropertyStaging.surface {
                        InventoryHybridVariantView(step: $0)
                    }),
            ]
        )
    ]
}
