/// How an item says what it can do, settled on the device for templates.
///
/// Staged on New item's typed state, where a type's template brings its fields.
internal enum InventoryPropertyExperiment {
    @MainActor internal static let all: [DesignExperiment] = [
        DesignExperiment(
            id: "inventory-item-properties",
            question:
                "How should an item record what it can do, fixed templates per category, free typed "
                + "key/values, tags and prose, a template that suggests without binding, or one read "
                + "off what similar items already record?",
            subject: InventoryCreationSurfaces.createID,
            status: .decided(
                variant: "templates",
                rationale:
                    "Decided by Joao on the device, 2026-09-16: templates. Observed was the better "
                    + "answer to who writes the types, and it turned out not to be one: its cluster is "
                    + "keyed on a category somebody still types, so it removed field definitions and "
                    + "never type definitions. A key that becomes popular retroactively blanks every "
                    + "item filed before it, an item filed with no type sits outside every type-based "
                    + "search, and a field's unit and choice values had nowhere to come from at all. "
                    + "Defining every type up front makes drift impossible by construction rather "
                    + "than correctable after the fact."),
            variants: [
                DesignVariant(
                    id: "templates",
                    title: "Templates",
                    note:
                        "A type owns a fixed set of fields, and choosing the type brings them into the form.",
                    surface: InventoryCreationSurfaces.create(opening: "typed"))
            ]
        )
    ]
}
