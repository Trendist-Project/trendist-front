import { defineConfig } from '@apps-in-toss/web-framework/config';

// 앱인토스 설정. appName은 앱인토스 콘솔에 등록한 앱 이름과 같아야 업로드된다.
export default defineConfig({
  appName: 'trendist',
  brand: { primaryColor: '#3fb68b' },
  // 자랑하기 카드의 [링크 복사](4.24)
  permissions: [{ name: 'clipboard', access: 'write' }],
  // 조이스틱·드래그 이동이 당겨서 새로고침·뒤로 가기 제스처·화면 튕김으로 빠지지 않게 막는다
  webView: {
    bounces: false,
    pullToRefreshEnabled: false,
    overScrollMode: 'never',
    allowsBackForwardNavigationGestures: false,
  },
  webBundleDir: 'dist',
});
