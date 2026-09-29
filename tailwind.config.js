// 画面の見た目の部品（Tailwind CSS）を、ネットからではなくアプリに同梱した vendor/tailwind.css から
// 読み込むための設定（改善提案7）。index.html と js/ の中で使っているクラスだけを集めて作る。
// 画面の部品（class="..."）を新しく使ったときは、次のコマンドで作り直す：
//   npm run build:css
module.exports = {
  content: ['./index.html', './js/**/*.js'],
  theme: { extend: {} },
  plugins: []
};
