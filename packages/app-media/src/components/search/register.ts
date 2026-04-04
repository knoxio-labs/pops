/**
 * Side-effect module that registers media search ResultComponents.
 * Import this module to register the movies ResultComponent.
 */
import { registerResultComponent } from "@pops/navigation";
import { MovieSearchResult } from "./MovieSearchResult";

registerResultComponent("movies", MovieSearchResult);
