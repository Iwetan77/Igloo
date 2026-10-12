/** The supplied vector wordmark; its colour follows the surrounding theme. */
export function BrandLogo({ className = "", symbolOnly = false }: {
  className?: string;
  symbolOnly?: boolean;
}) {
  return <span role="img" aria-label="Igloo" className={"brand-logo " + (symbolOnly ? "brand-symbol " : "wordmark ") + className} />;
}
