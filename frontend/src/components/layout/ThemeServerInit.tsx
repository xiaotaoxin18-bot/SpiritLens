/**
 * Inline script that applies the saved theme class before first paint,
 * preventing a flash of wrong theme on page load.
 */
export function ThemeServerInit() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
          (function() {
            try {
              var t = localStorage.getItem('spiritlens-theme');
              if (t === 'light') {
                document.documentElement.classList.add('light');
                document.documentElement.classList.remove('dark');
              } else {
                document.documentElement.classList.add('dark');
                document.documentElement.classList.remove('light');
              }
            } catch(e) {}
          })();
        `,
      }}
    />
  );
}
