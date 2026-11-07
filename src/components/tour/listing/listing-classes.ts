// Button classes of the listing's client components, written out (buttonVariants() with
// variant "outline" and "ghost") so its chunk carries two strings rather than the variant maps:
// small modules shared between chunks are copied into each one (initial-JS budget). A unit test
// keeps them equal to buttonVariants().
const BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-small font-medium tracking-wide transition-colors duration-200 ease-luxe focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0";

export const OUTLINE_BUTTON = `${BASE} border border-primary bg-transparent text-foreground hover:bg-primary hover:text-primary-foreground h-11 px-6`;
export const GHOST_BUTTON = `${BASE} text-foreground hover:bg-secondary h-11 px-6`;
