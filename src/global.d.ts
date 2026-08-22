declare module '*.css' {
  const content: { [className: string]: string };
  export default content;
}

declare module 'escape-html' {
  function escapeHtml(string: string): string;
  export = escapeHtml;
}
