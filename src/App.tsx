import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { ConfigProvider, theme, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useLocaleStore } from '@/stores/localeStore';
import AppLayout from '@/components/Layout/AppLayout';
import ProtectedRoute from '@/components/ProtectedRoute';
import LoginPage from '@/pages/Login';
import RegisterPage from '@/pages/Register';
import ProjectListPage from '@/pages/ProjectList';
import ProjectDetailPage from '@/pages/ProjectDetail';
import AssetLibraryPage from '@/pages/AssetLibrary';
import CharacterDetailPage from '@/pages/AssetLibrary/CharacterDetail';
import EnvironmentDetailPage from '@/pages/AssetLibrary/EnvironmentDetail';
import StyleDetailPage from '@/pages/AssetLibrary/StyleDetail';
import SettingsPage from '@/pages/Settings';
import UserManagementPage from '@/pages/Admin/UserManagement';

const darkTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: '#a855f7',
    colorBgContainer: '#141414',
    colorBgElevated: '#1a1a1a',
    colorBorder: '#1e1e1e',
    colorBgLayout: '#0c0c0c',
    borderRadius: 8,
  },
};

export default function App() {
  const { token, fetchMe } = useAuthStore();
  const lang = useLocaleStore((state) => state.lang);

  useEffect(() => {
    if (token) {
      fetchMe();
    }
  }, [token, fetchMe]);

  return (
    <ConfigProvider theme={darkTheme} locale={lang === 'zh' ? zhCN : enUS}>
      <AntApp>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/projects" element={<ProjectListPage />} />
              <Route path="/projects/:id" element={<ProjectDetailPage />} />
              <Route path="/assets" element={<AssetLibraryPage />} />
              <Route path="/assets/characters/:id" element={<CharacterDetailPage />} />
              <Route path="/assets/environments/:id" element={<EnvironmentDetailPage />} />
              <Route path="/assets/styles/:id" element={<StyleDetailPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route
                path="/admin/users"
                element={
                  <ProtectedRoute requireAdmin>
                    <UserManagementPage />
                  </ProtectedRoute>
                }
              />
            </Route>
            <Route path="*" element={<Navigate to="/projects" replace />} />
          </Routes>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
}
