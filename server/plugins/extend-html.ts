export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:html', (html, { event }) => {
    // This will be an object representation of the html template.
    html.head.push(`<link rel="manifest" href="/manifest.webmanifest">`);
    html.head.push(
      `<script defer src="https://cloud.umami.is/script.js" data-website-id="33fa216d-5188-4249-b6ea-391e4aae906d"></script>`
    );
    html.head.push(`<link rel="apple-touch-icon" sizes="57x57" href="/apple-icon-57x57.png">
                    <link rel="apple-touch-icon" sizes="60x60" href="/apple-icon-60x60.png">
                    <link rel="apple-touch-icon" sizes="72x72" href="/apple-icon-72x72.png">
                    <link rel="apple-touch-icon" sizes="76x76" href="/apple-icon-76x76.png">
                    <link rel="apple-touch-icon" sizes="114x114" href="/apple-icon-114x114.png">
                    <link rel="apple-touch-icon" sizes="120x120" href="/apple-icon-120x120.png">
                    <link rel="apple-touch-icon" sizes="144x144" href="/apple-icon-144x144.png">
                    <link rel="apple-touch-icon" sizes="152x152" href="/apple-icon-152x152.png">
                    <link rel="apple-touch-icon" sizes="180x180" href="/apple-icon-180x180.png">
                    <link rel="icon" type="image/png" sizes="192x192"  href="/android-icon-192x192.png">
                    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
                    <link rel="icon" type="image/png" sizes="96x96" href="/favicon-96x96.png">
                    <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
                    <meta name="msapplication-TileColor" content="#170206">
                    <meta name="msapplication-TileImage" content="/ms-icon-144x144.png">
                    <meta name="theme-color" content="#170206">`);
  });
  // You can also intercept the response here.
  nitroApp.hooks.hook('render:response', (response, { event }) => {});
});
