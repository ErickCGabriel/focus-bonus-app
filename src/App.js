import React, { useState, useEffect, useMemo, createContext, useContext } from 'react';
import { Users, BarChart3, Calendar, PlusCircle, X, Briefcase, Mountain, ChevronLeft, ChevronRight, Edit, Trash2, UserPlus, Save, AlertTriangle, FileSpreadsheet, Trophy, LogOut, KeyRound, ShieldCheck, Cog, Bell, DollarSign, CheckCircle2, XCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';

// Importações do Firebase
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail, updatePassword } from "firebase/auth";
import { getFirestore, collection, onSnapshot, addDoc, doc, setDoc, deleteDoc, query, where, updateDoc } from "firebase/firestore";

// --- Configuração do Firebase ---
const firebaseConfig = {
  apiKey: "AIzaSyBjuptPqAa86wUvwMyR5lAJpoi8UuaK8IA",
  authDomain: "bonus-focus.firebaseapp.com",
  projectId: "bonus-focus",
  storageBucket: "bonus-focus.firebasestorage.app",
  messagingSenderId: "369112012231",
  appId: "1:369112012231:web:9547abd9c893e437f335e2"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- COMPONENTES DE UI GENÉRICOS & UTILITÁRIOS ---
const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();
const getQuarter = (date) => Math.floor(date.getMonth() / 3) + 1;
const getMonthsForQuarter = (q) => {
    if (q === 1) return [0, 1, 2];
    if (q === 2) return [3, 4, 5];
    if (q === 3) return [6, 7, 8];
    if (q === 4) return [9, 10, 11];
    return [];
};

const parseDate = (dateString) => {
    if (!dateString || typeof dateString !== 'string') {
        return new Date(NaN);
    }
    const [year, month, day] = dateString.split("-").map(Number);
    return new Date(year, month - 1, day);
};
const Card = ({ children, className = '' }) => <div className={`bg-white rounded-lg shadow-md p-6 ${className}`}>{children}</div>;
const Button = ({ children, onClick, className = '', variant = 'primary', type = 'button', disabled = false }) => {
    const baseClasses = 'px-4 py-2 rounded-md font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed';
    const variants = {
        primary: 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm',
        secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300',
        danger: 'bg-red-600 text-white hover:bg-red-700',
    };
    return <button type={type} onClick={onClick} disabled={disabled} className={`${baseClasses} ${variants[variant]} ${className}`}>{children}</button>;
};
const IconButton = ({ children, onClick }) => <button onClick={onClick} className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-full">{children}</button>;


// --- LÓGICA DE CÁLCULO DE BÔNUS (HELPER) ---
const calculateMonthlyBonus = (collaboratorId, allEvaluations, businessDays, year, month) => {
    // MODIFICADO: Filtra apenas as avaliações finalizadas para o cálculo
    const myEvals = allEvaluations.filter(e => {
        const evalDate = parseDate(e.startDate);
        return e.collaboratorId === collaboratorId &&
               evalDate.getFullYear() === year &&
               evalDate.getMonth() === month &&
               e.isFinalized === true; // <-- SÓ CALCULA SE FINALIZADA
    });

    let officeDaysWorked = 0;
    let fieldBonus = 0;
    const monthId = `${year}-${String(month + 1).padStart(2, '0')}`;
    const totalBusinessDays = businessDays[monthId]?.days || 22;

    const officeEvals = myEvals.filter(e => e.activityType === 'Escritório');
    let officePossiblePoints = 0;
    let officeObtainedPoints = 0;

    officeEvals.forEach(e => {
        const duration = (parseDate(e.endDate).getTime() - parseDate(e.startDate).getTime()) / 86400000 + 1;
        officeDaysWorked += duration;
        officePossiblePoints += duration * 3;
        officeObtainedPoints += duration * Object.values(e.criteria).reduce((a, b) => a + (b || 0), 0);
    });

    const officePerformancePercentage = officePossiblePoints > 0 ? (officeObtainedPoints / officePossiblePoints) * 100 : 0;
    let officeBonus = totalBusinessDays > 0 ? (officeDaysWorked / totalBusinessDays) * 200 : 0;

    if (officePerformancePercentage < 80) {
        officeBonus = 0;
    }

    const fieldEvals = myEvals.filter(e => e.activityType === 'Campo');
    const hasEquipmentFailureInMonth = fieldEvals.some(e => e.criteria.equipamento === 0);

    fieldEvals.forEach(e => {
        const allCriteriaMet = Object.values(e.criteria).every((v) => v === 1);
        if (allCriteriaMet) {
            const duration = (parseDate(e.endDate).getTime() - parseDate(e.startDate).getTime()) / 86400000 + 1;
            fieldBonus += duration * 60;
        }
    });

    if (hasEquipmentFailureInMonth) {
        fieldBonus = 0;
    }

    // NOVO: Aplica o limite de R$ 200 para o bônus de campo
    const finalFieldBonus = Math.min(fieldBonus, 200);

    return { officeBonus, fieldBonus: finalFieldBonus, totalBonus: officeBonus + finalFieldBonus, officeDaysWorked, totalBusinessDays, officeEvals: officeEvals.length, fieldEvals: fieldEvals.length };
};

// NOVO: Função para chamar a Cloud Function de atualização de senha (exemplo)
const updateUserPasswordOnServer = async (uid, newPassword) => {
    // Esta é uma chamada para uma função de back-end (Firebase Cloud Function)
    // Você precisará implementar a função 'updateUserPassword' no seu Firebase.
    // Exemplo da Cloud Function (adicione ao arquivo index.js no seu projeto Firebase Functions):
    /*
    const functions = require("firebase-functions");
    const admin = require("firebase-admin");
    admin.initializeApp();

    exports.updateUserPassword = functions.https.onCall(async (data, context) => {
      // Verifique se o chamador é um administrador
      if (context.auth.token.role !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 'Apenas administradores podem alterar senhas.');
      }
      const { uid, password } = data;
      if (!uid || !password || password.length < 6) {
        throw new functions.https.HttpsError('invalid-argument', 'UID e uma senha de no mínimo 6 caracteres são necessários.');
      }
      try {
        await admin.auth().updateUser(uid, { password: password });
        return { success: true, message: 'Senha atualizada com sucesso.' };
      } catch (error) {
        console.error("Erro ao atualizar senha:", error);
        throw new functions.https.HttpsError('internal', error.message);
      }
    });
    */
    console.warn("A funcionalidade de alterar senha requer uma Cloud Function no Firebase chamada 'updateUserPassword'.");
    // Simulação da chamada, substitua pela chamada real à sua Cloud Function quando ela for implementada.
    alert(`SIMULAÇÃO: A senha do usuário com UID ${uid} seria alterada para "${newPassword}". Implemente a Cloud Function para que isso funcione de verdade.`);
    return { success: true };
};


// --- CONTEXTO GLOBAL DA APLICAÇÃO ---
const AppContext = createContext();

const AppProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [userProfile, setUserProfile] = useState(null);
    const [isLoadingAuth, setIsLoadingAuth] = useState(true);

    const [users, setUsers] = useState([]);
    const [collaborators, setCollaborators] = useState([]);
    const [evaluations, setEvaluations] = useState([]);
    const [businessDays, setBusinessDays] = useState({});
    const [notifications, setNotifications] = useState([]);
    const [confirmation, setConfirmation] = useState({ isOpen: false, title: '', message: '', onConfirm: null });
    
    const usersCollectionPath = `users`;
    const collaboratorsCollectionPath = `collaborators`;
    const evaluationsCollectionPath = `evaluations`;
    const businessDaysCollectionPath = `business_days`;
    const notificationsCollectionPath = `notifications`;

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
            setIsLoadingAuth(false);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (currentUser) {
            const userDocRef = doc(db, usersCollectionPath, currentUser.uid);
            const unsubscribeProfile = onSnapshot(userDocRef, (docSnap) => {
                if (docSnap.exists()) {
                    setUserProfile({id: docSnap.id, ...docSnap.data()});
                } else {
                    console.error("No profile found for logged-in user. Logging out.");
                    signOut(auth);
                }
            });

            const unsubUsers = onSnapshot(query(collection(db, usersCollectionPath)), snapshot => setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
            const unsubCollabs = onSnapshot(query(collection(db, collaboratorsCollectionPath)), snapshot => setCollaborators(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
            const unsubEvals = onSnapshot(query(collection(db, evaluationsCollectionPath)), snapshot => setEvaluations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
            const unsubBusinessDays = onSnapshot(query(collection(db, businessDaysCollectionPath)), snapshot => {
                const daysData = {};
                snapshot.forEach(doc => {
                    daysData[doc.id] = doc.data();
                });
                setBusinessDays(daysData);
            });
            const unsubNotifications = onSnapshot(query(collection(db, notificationsCollectionPath), where("recipientId", "==", userProfile?.id || "")), snapshot => setNotifications(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
            
            return () => {
                unsubscribeProfile();
                unsubUsers();
                unsubCollabs();
                unsubEvals();
                unsubBusinessDays();
                unsubNotifications();
            };
        } else {
            setUserProfile(null);
        }
    }, [currentUser, userProfile?.id]);

    const handleLogin = async (email, password) => {
        try {
            await signInWithEmailAndPassword(auth, email, password);
            return { success: true };
        } catch (error) {
            return { success: false, message: "Credenciais inválidas." };
        }
    };

    const handleLogout = async () => await signOut(auth);

    const visibleCollaborators = useMemo(() => {
        if (!userProfile) return [];
        if (['admin', 'gerente', 'financeiro'].includes(userProfile.role)) return collaborators;
        if (userProfile.role === 'manager') {
            const userTeams = Array.isArray(userProfile.team) ? userProfile.team : [userProfile.team];
            return collaborators.filter(c => userTeams.includes(c.team));
        }
        if (userProfile.role === 'collaborator') {
             return collaborators.filter(c => c.id === userProfile.collaboratorId);
        }
        return [];
    }, [userProfile, collaborators]);
    
    // MODIFICADO: Para lidar com a atualização de senha de um usuário existente
    const handleSaveSystemUser = async (user) => {
        try {
            const userData = {
                name: user.name,
                email: user.email,
                role: user.role,
                team: user.role === 'manager' ? user.team : null,
                collaboratorId: user.role === 'collaborator' ? user.collaboratorId : null,
            };

            if (user.id) { // Editando um usuário existente
                const userRef = doc(db, usersCollectionPath, user.id);
                await updateDoc(userRef, userData);
                
                // NOVO: Se uma nova senha foi fornecida para um usuário existente
                if (user.password) {
                    // Esta chamada requer uma Cloud Function com privilégios de admin
                    await updateUserPasswordOnServer(user.id, user.password);
                }
            } else { // Criando um novo usuário
                const userCredential = await createUserWithEmailAndPassword(auth, user.email, user.password);
                userData.uid = userCredential.user.uid;
                userData.requiresPasswordChange = true; // Forçar troca de senha no primeiro login
                await setDoc(doc(db, usersCollectionPath, userCredential.user.uid), userData);
            }
        } catch (error) {
            console.error("Erro ao salvar utilizador do sistema:", error);
            alert("Erro ao salvar usuário: " + error.message);
        }
    };
    
    const handleDeleteSystemUser = async (userId, userName) => {
        setConfirmation({
            isOpen: true,
            title: `Excluir Usuário do Sistema`,
            message: `Você tem certeza que deseja excluir o perfil de ${userName}? Esta ação não pode ser desfeita. Lembre-se de excluir a conta também na aba 'Authentication' do Firebase.`,
            onConfirm: async () => {
                try {
                    await deleteDoc(doc(db, usersCollectionPath, userId));
                } catch (error) {
                    console.error("Erro ao excluir usuário do sistema:", error);
                    alert("Ocorreu um erro ao excluir o perfil do usuário.");
                }
                setConfirmation({ isOpen: false });
            }
        });
    };

    const handleSendPasswordReset = (email) => {
        setConfirmation({
            isOpen: true,
            title: 'Redefinir Senha',
            message: `Deseja enviar um e-mail de redefinição de senha para ${email}?`,
            onConfirm: async () => {
                try {
                    await sendPasswordResetEmail(auth, email);
                    alert('E-mail de redefinição de senha enviado com sucesso!');
                } catch (error) {
                    console.error("Erro ao enviar e-mail de redefinição:", error);
                    alert('Falha ao enviar e-mail: ' + error.message);
                }
                setConfirmation({ isOpen: false });
            }
        });
    };

    const handleChangePassword = async (newPassword) => {
        if (!auth.currentUser) return { success: false, message: "Nenhum usuário logado." };
        try {
            await updatePassword(auth.currentUser, newPassword);
            const userDocRef = doc(db, usersCollectionPath, auth.currentUser.uid);
            await updateDoc(userDocRef, { requiresPasswordChange: false });
            return { success: true };
        } catch (error) {
            console.error("Erro ao alterar senha:", error);
            return { success: false, message: "Erro ao alterar senha: " + error.message };
        }
    };

    const handleDeleteNotification = async (notificationId) => {
        try {
            await deleteDoc(doc(db, notificationsCollectionPath, notificationId));
        } catch (error) {
            console.error("Erro ao deletar notificação:", error);
        }
    };

    const handleSaveCollaborator = async (collaborator) => {
        try {
            const { id, ...collabData } = collaborator;
            if (id) {
                await setDoc(doc(db, collaboratorsCollectionPath, id), collabData);
            } else {
                await addDoc(collection(db, collaboratorsCollectionPath), collabData);
            }
        } catch (error) {
            console.error("Erro ao salvar colaborador:", error);
        }
    };
    
    const handleDeleteCollaborator = async (id) => {
        setConfirmation({
            isOpen: true,
            title: 'Excluir Colaborador',
            message: 'Tem certeza que deseja excluir este colaborador? Todas as suas avaliações também serão removidas.',
            onConfirm: async () => {
                try {
                    await deleteDoc(doc(db, collaboratorsCollectionPath, id));
                } catch (error) {
                    console.error("Erro ao deletar colaborador:", error);
                }
                setConfirmation({ isOpen: false });
            }
        });
    };

    const handleSaveEvaluation = async (evaluation) => {
        try {
            const { id, ...evalData } = evaluation;
            const evaluationWithManager = {
                ...evalData,
                managerName: userProfile?.name || 'Desconhecido',
                managerId: userProfile?.id || null,
                createdAt: new Date().toISOString()
            };
            
            if (id) {
                await setDoc(doc(db, evaluationsCollectionPath, id), evaluationWithManager);
            } else {
                await addDoc(collection(db, evaluationsCollectionPath), evaluationWithManager);
            }
        } catch (error) {
            console.error("Erro ao salvar avaliação:", error);
        }
    };

    const handleDeleteEvaluation = async (id) => {
        setConfirmation({
            isOpen: true,
            title: 'Excluir Avaliação',
            message: 'Tem certeza que deseja excluir esta avaliação?',
            onConfirm: async () => {
                try {
                    await deleteDoc(doc(db, evaluationsCollectionPath, id));
                } catch (error) {
                    console.error("Erro ao deletar avaliação:", error);
                }
                setConfirmation({ isOpen: false });
            }
        });
    };
    
    const handleCreateNotification = async (recipientId, title, message, type = 'info') => {
        try {
            await addDoc(collection(db, notificationsCollectionPath), {
                recipientId,
                title,
                message,
                type,
                read: false,
                createdAt: new Date().toISOString(),
                senderId: userProfile?.id || null,
                senderName: userProfile?.name || 'Sistema'
            });
        } catch (error) {
            console.error("Erro ao criar notificação:", error);
        }
    };
    
    const handleMarkNotificationAsRead = async (notificationId) => {
        try {
            await updateDoc(doc(db, notificationsCollectionPath, notificationId), { read: true });
        } catch (error) {
            console.error("Erro ao marcar notificação como lida:", error);
        }
    };

    const handleSaveBusinessDays = async (year, month, days) => {
        const docId = `${year}-${String(month + 1).padStart(2, '0')}`;
        try {
            await setDoc(doc(db, businessDaysCollectionPath, docId), { days: Number(days) });
        } catch (error) {
            console.error("Erro ao salvar dias úteis:", error);
        }
    };

    const value = {
        isAuthenticated: !!currentUser, 
        currentUser: userProfile, 
        isLoading: isLoadingAuth || (currentUser && !userProfile),
        users,
        collaborators: visibleCollaborators, 
        allCollaborators: collaborators, 
        evaluations,
        businessDays,
        notifications,
        handleLogin, 
        handleLogout,
        handleSaveSystemUser,
        handleDeleteSystemUser,
        handleSaveCollaborator,
        handleDeleteCollaborator,
        handleSaveEvaluation,
        handleDeleteEvaluation,
        handleSaveBusinessDays,
        handleCreateNotification,
        handleMarkNotificationAsRead,
        handleDeleteNotification,
        handleSendPasswordReset,
        handleChangePassword,
        confirmation,
        setConfirmation
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

// --- COMPONENTE PRINCIPAL & ROUTER ---
export default function App() {
    return (
        <AppProvider>
            <AppRouter />
        </AppProvider>
    );
}

function AppRouter() {
    const { isAuthenticated, isLoading } = useContext(AppContext);
    if (isLoading) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-100"><p>Carregando Aplicação...</p></div>;
    }
    return isAuthenticated ? <AppContent /> : <LoginPage />;
}

// --- PÁGINA DE LOGIN ---
function LoginPage() {
    const { handleLogin } = useContext(AppContext);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoggingIn(true);
        const result = await handleLogin(email, password);
        if (!result.success) {
            setError(result.message || 'Ocorreu um erro.');
            setIsLoggingIn(false);
        }
    };

    return (
        <div className="bg-gray-100 min-h-screen flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <Card className="shadow-2xl">
                    <div className="text-center mb-8">
                        <Trophy className="w-16 h-16 text-blue-600 mx-auto mb-4" />
                        <h1 className="text-3xl font-bold text-gray-900">Focus Bonus App</h1>
                        <p className="text-gray-600">Por favor, faça login para continuar.</p>
                    </div>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Email</label>
                            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 block w-full p-3 border border-gray-300 rounded-md shadow-sm" placeholder="ex: admin@focus.com" required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Senha</label>
                            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 block w-full p-3 border border-gray-300 rounded-md shadow-sm" placeholder="••••••••" required />
                        </div>
                        {error && <p className="text-sm text-red-600 text-center">{error}</p>}
                        <div>
                            <Button type="submit" className="w-full text-lg" disabled={!email || !password || isLoggingIn}>
                                {isLoggingIn ? 'Entrando...' : <><KeyRound size={20} /> Entrar</>}
                            </Button>
                        </div>
                    </form>
                </Card>
            </div>
        </div>
    );
}

// --- CONTEÚDO PRINCIPAL DA APLICAÇÃO ---
function AppContent() {
    const { currentUser, confirmation, setConfirmation } = useContext(AppContext);
    
    const getInitialView = () => {
        if (currentUser.role === 'collaborator') return 'collaborator_view';
        if (currentUser.role === 'financeiro') return 'financial';
        return 'dashboard';
    };
    
    const [currentView, setCurrentView] = useState(getInitialView());
    const [isEvalModalOpen, setIsEvalModalOpen] = useState(false);
    const [editingEvaluation, setEditingEvaluation] = useState(null);
    const [evalModalProps, setEvalModalProps] = useState({ dateRange: { start: null, end: null }, collaboratorId: null });
    const [isCollaboratorModalOpen, setIsCollaboratorModalOpen] = useState(false);
    const [editingCollaborator, setEditingCollaborator] = useState(null);
    const [isAccessModalOpen, setIsAccessModalOpen] = useState(false);
    const [editingAccessUser, setEditingAccessUser] = useState(null);

    if (!currentUser) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-100"><p>Carregando Perfil...</p></div>;
    }

    // Forçar troca de senha se necessário
    if (currentUser.requiresPasswordChange) {
        return <ForcePasswordChangeModal />;
    }

    const isCalendarReadOnly = currentUser.role === 'financeiro';
    const canSeeFinancial = ['admin', 'gerente', 'financeiro'].includes(currentUser.role);
    const canLaunchAssessments = ['admin', 'manager', 'gerente', 'financeiro'].includes(currentUser.role);

    return (
        <div className="bg-gray-50 min-h-screen font-sans text-gray-800">
            <Header />
            <main className="p-4 sm:p-8 max-w-7xl mx-auto">
                <AppNavigator currentView={currentView} setCurrentView={setCurrentView} />
                {(currentUser.role === 'admin' || currentUser.role === 'manager' || currentUser.role === 'gerente') && currentView === 'dashboard' && <DashboardModule />} 
                {canLaunchAssessments && currentView === 'calendar' && <CalendarModule isReadOnly={isCalendarReadOnly} onLaunchEvalModal={(evalToEdit, dateRange, collaboratorId) => { setEditingEvaluation(evalToEdit); setEvalModalProps({dateRange, collaboratorId}); setIsEvalModalOpen(true); }} />} 
                {canSeeFinancial && currentView === 'financial' && <FinancialModule />} 
                {currentUser.role === 'gerente' && currentView === 'audit' && <AuditModule />} 
                {currentUser.role === 'collaborator' && currentView === 'collaborator_view' && <CollaboratorViewModule />} 
                {(currentUser.role === 'admin' || currentUser.role === 'gerente') && currentView === 'collaborators' && <CollaboratorManagementModule onLaunchCollaboratorModal={(user) => { setEditingCollaborator(user); setIsCollaboratorModalOpen(true); }} />} 
                {currentUser.role === 'admin' && currentView === 'access' && <AccessControlModule onLaunchAccessModal={(user) => { setEditingAccessUser(user); setIsAccessModalOpen(true); }} />} 
                {(currentUser.role === 'admin' || currentUser.role === 'gerente') && currentView === 'business_days' && <BusinessDaysModule />} 
            </main>
            
            {isEvalModalOpen && <EvaluationModal isOpen={isEvalModalOpen} onClose={() => setIsEvalModalOpen(false)} {...evalModalProps} initialData={editingEvaluation} />} 
            {isCollaboratorModalOpen && <CollaboratorModal isOpen={isCollaboratorModalOpen} onClose={() => setIsCollaboratorModalOpen(false)} initialData={editingCollaborator} />} 
            {isAccessModalOpen && <AccessControlModal isOpen={isAccessModalOpen} onClose={() => setIsAccessModalOpen(false)} initialData={editingAccessUser} />} 
            {confirmation.isOpen && <ConfirmationModal isOpen={confirmation.isOpen} onClose={() => setConfirmation({ isOpen: false })} onConfirm={confirmation.onConfirm} title={confirmation.title} message={confirmation.message} />} 
        </div>
    );
}

// --- COMPONENTES DE NAVEGAÇÃO E CABEÇALHO ---
function Header() {
    const { currentUser, handleLogout, notifications, handleMarkNotificationAsRead, handleDeleteNotification } = useContext(AppContext);
    const [showNotifications, setShowNotifications] = useState(false);
    
    const unreadCount = notifications.filter(n => !n.read).length;
    
    const getRoleDisplay = () => {
        if (!currentUser || !currentUser.role) return '';
        const role = currentUser.role;
        if (role === 'admin') return 'Administrador';
        if (role === 'collaborator') return 'Colaborador';
        if (role === 'gerente') return 'Gerente';
        if (role === 'financeiro') return 'Financeiro';
        if (role === 'manager') {
            const teams = Array.isArray(currentUser.team) ? currentUser.team : [currentUser.team].filter(Boolean);
            if (teams.length === 0) return 'Gestor';
            return teams.length === 1 ? `Gestor - ${teams[0]}` : `Gestor - ${teams.length} equipes`;
        }
        return role;
    };
    
    const handleNotificationClick = (notification) => {
        if (!notification.read) {
            handleMarkNotificationAsRead(notification.id);
        }
    };
    
    return (
        <header className="bg-white shadow-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-8 py-4 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <Trophy className="w-8 h-8 text-blue-600" />
                    <h1 className="text-2xl font-bold text-gray-900">Focus Bonus App</h1>
                </div>
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <button 
                            onClick={() => setShowNotifications(!showNotifications)}
                            className="relative p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-full"
                        >
                            <Bell size={20} />
                            {unreadCount > 0 && (
                                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                                    {unreadCount}
                                </span>
                            )}
                        </button>
                        
                        {showNotifications && (
                            <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border z-50 max-h-96 overflow-y-auto">
                                <div className="p-3 border-b">
                                    <h3 className="font-semibold">Notificações</h3>
                                </div>
                                {notifications.length === 0 ? (
                                    <div className="p-4 text-center text-gray-500">
                                        Nenhuma notificação
                                    </div>
                                ) : (
                                    <div className="divide-y">
                                        {notifications.map(notification => (
                                            <div 
                                                key={notification.id} 
                                                onClick={() => handleNotificationClick(notification)}
                                                className={`p-3 cursor-pointer group relative hover:bg-gray-50 ${!notification.read ? 'bg-blue-50' : ''}`}
                                            >
                                                <IconButton onClick={(e) => { e.stopPropagation(); handleDeleteNotification(notification.id); }}>
                                                    <X size={14} className="absolute top-2 right-2 text-gray-400 hidden group-hover:block hover:text-red-600" />
                                                </IconButton>
                                                <div className="flex justify-between items-start">
                                                    <div className="flex-1 pr-4">
                                                        <p className="font-medium text-sm">{notification.title}</p>
                                                        <p className="text-xs text-gray-600 mt-1">{notification.message}</p>
                                                        <p className="text-xs text-gray-400 mt-1">
                                                            {new Date(notification.createdAt).toLocaleDateString('pt-BR')}
                                                        </p>
                                                    </div>
                                                    {!notification.read && (
                                                        <div className=""></div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700">Olá, {currentUser?.name || 'Usuário'}</span>
                        <span className="text-xs text-gray-500">({getRoleDisplay()})</span>
                    </div>
                    <Button onClick={handleLogout} variant="secondary"><LogOut size={16} /> Sair</Button>
                </div>
            </div>
        </header>
    );
}

function AppNavigator({ currentView, setCurrentView }) {
    const { currentUser } = useContext(AppContext);
    const navItems = useMemo(() => {
        const items = [];
        if (['admin', 'manager', 'gerente'].includes(currentUser.role)) {
            items.push({ id: 'dashboard', label: 'Dashboard', icon: <BarChart3 size={18} /> });
        }
        if (['admin', 'manager', 'gerente', 'financeiro'].includes(currentUser.role)) {
            items.push({ id: 'calendar', label: 'Calendário', icon: <Calendar size={18} /> });
        }
        if (['admin', 'gerente', 'financeiro'].includes(currentUser.role)) {
            items.push({ id: 'financial', label: 'Financeiro', icon: <DollarSign size={18} /> });
        }
        if (currentUser.role === 'gerente') {
            items.push({ id: 'audit', label: 'Auditoria', icon: <ShieldCheck size={18} /> });
        }
        if (currentUser.role === 'collaborator') {
            items.push({ id: 'collaborator_view', label: 'Minhas Avaliações', icon: <UserPlus size={18} /> });
        }
        if (['admin', 'gerente'].includes(currentUser.role)) {
            items.push({ id: 'collaborators', label: 'Colaboradores', icon: <Users size={18} /> });
            items.push({ id: 'business_days', label: 'Dias Úteis', icon: <Cog size={18} /> });
        }
        if (currentUser.role === 'admin') {
            items.push({ id: 'access', label: 'Controle de Acesso', icon: <KeyRound size={18} /> });
        }
        return items;
    }, [currentUser.role]);

    return (
        <nav className="bg-white p-4 rounded-lg shadow-md mb-8">
            <ul className="flex flex-wrap justify-center sm:justify-start gap-4">
                {navItems.map(item => (
                    <li key={item.id}>
                        <button
                            onClick={() => setCurrentView(item.id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${currentView === item.id ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
                        >
                            {item.icon}
                            <span className="text-sm font-medium">{item.label}</span>
                        </button>
                    </li>
                ))}
            </ul>
        </nav>
    );
}

// --- MÓDULOS DE VISUALIZAÇÃO --- 
function DashboardModule() {
    const { collaborators, evaluations, businessDays } = useContext(AppContext);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedQuarter, setSelectedQuarter] = useState(getQuarter(new Date()));

    const years = useMemo(() => {
        const currentYear = new Date().getFullYear();
        return Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
    }, []);

    const quarterlyData = useMemo(() => {
        const data = {};
        const monthsInQuarter = getMonthsForQuarter(selectedQuarter);

        collaborators.forEach(collab => {
            let totalBonus = 0;
            monthsInQuarter.forEach(month => {
                const { totalBonus: monthBonus } = calculateMonthlyBonus(collab.id, evaluations, businessDays, selectedYear, month);
                totalBonus += monthBonus;
            });
            data[collab.name] = totalBonus;
        });

        return Object.entries(data).map(([name, bonus]) => ({ name, bonus }));
    }, [collaborators, evaluations, businessDays, selectedYear, selectedQuarter]);

    const monthlyBonusTrends = useMemo(() => {
        const trends = {};
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth();

        collaborators.forEach(collab => {
            trends[collab.name] = [];
            for (let i = 0; i < 6; i++) { // Last 6 months
                let year = currentYear;
                let month = currentMonth - i;
                if (month < 0) {
                    month += 12;
                    year -= 1;
                }
                const { totalBonus } = calculateMonthlyBonus(collab.id, evaluations, businessDays, year, month);
                trends[collab.name].unshift({ month: `${month + 1}/${year}`, bonus: totalBonus });
            }
        });
        return trends;
    }, [collaborators, evaluations, businessDays]);

    return (
        <div className="space-y-8">
            <h2 className="text-2xl font-bold text-gray-900">Dashboard de Bônus</h2>

            <Card>
                <h3 className="text-xl font-semibold mb-4">Bônus por Colaborador (Trimestral)</h3>
                <div className="flex gap-4 mb-4">
                    <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} className="p-2 border rounded-md">
                        {years.map(year => <option key={year} value={year}>{year}</option>)}
                    </select>
                    <select value={selectedQuarter} onChange={(e) => setSelectedQuarter(Number(e.target.value))} className="p-2 border rounded-md">
                        <option value={1}>Q1 (Jan-Mar)</option>
                        <option value={2}>Q2 (Abr-Jun)</option>
                        <option value={3}>Q3 (Jul-Set)</option>
                        <option value={4}>Q4 (Out-Dez)</option>
                    </select>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={quarterlyData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip formatter={(value) => `R$ ${value.toFixed(2)}`} />
                        <Legend />
                        <Bar dataKey="bonus" fill="#3b82f6" name="Bônus Total" />
                    </BarChart>
                </ResponsiveContainer>
            </Card>

            <Card>
                <h3 className="text-xl font-semibold mb-4">Tendência de Bônus (Últimos 6 Meses)</h3>
                <ResponsiveContainer width="100%" height={300}>
                    <LineChart margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis />
                        <Tooltip formatter={(value) => `R$ ${value.toFixed(2)}`} />
                        <Legend />
                        {Object.keys(monthlyBonusTrends).map((collabName, index) => (
                            <Line
                                key={collabName}
                                type="monotone"
                                dataKey="bonus"
                                data={monthlyBonusTrends[collabName]}
                                name={collabName}
                                stroke={`hsl(${index * 60}, 70%, 50%)`}
                            />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            </Card>
        </div>
    );
}

function CalendarModule({ isReadOnly, onLaunchEvalModal }) {
    const { collaborators, evaluations } = useContext(AppContext);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedCollaboratorId, setSelectedCollaboratorId] = useState('');
    const [viewingEvaluation, setViewingEvaluation] = useState(null);

    useEffect(() => {
        if (collaborators.length > 0 && !selectedCollaboratorId) {
            setSelectedCollaboratorId(collaborators[0].id);
        }
    }, [collaborators, selectedCollaboratorId]);

    const handleViewEvaluationDetails = (evaluation) => {
        setViewingEvaluation(evaluation);
    };

    if (collaborators.length === 0) {
        return <p>Nenhum colaborador cadastrado. Por favor, adicione colaboradores primeiro.</p>;
    }

    return (
        <div className="space-y-8">
            <h2 className="text-2xl font-bold text-gray-900">Calendário de Avaliações</h2>
            <Card>
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Selecionar Colaborador:</label>
                    <select
                        value={selectedCollaboratorId}
                        onChange={(e) => setSelectedCollaboratorId(e.target.value)}
                        className="p-2 border rounded-md w-full sm:w-auto"
                    >
                        {collaborators.map(collab => (
                            <option key={collab.id} value={collab.id}>{collab.name}</option>
                        ))}
                    </select>
                </div>
                {selectedCollaboratorId && (
                    <CalendarView
                        collaboratorId={selectedCollaboratorId}
                        onLaunchEvalModal={onLaunchEvalModal}
                        currentDate={currentDate}
                        setCurrentDate={setCurrentDate}
                        isReadOnly={isReadOnly}
                        onViewEvaluationDetails={handleViewEvaluationDetails}
                    />
                )}
            </Card>
            {viewingEvaluation && (
                <EvaluationDetailModal
                    isOpen={!!viewingEvaluation}
                    onClose={() => setViewingEvaluation(null)}
                    evaluation={viewingEvaluation}
                />
            )}
        </div>
    );
}

function CalendarView({ collaboratorId, onLaunchEvalModal, currentDate, setCurrentDate, isReadOnly = false, onViewEvaluationDetails }) {
    const { evaluations, handleDeleteEvaluation } = useContext(AppContext);
    const [startDate, setStartDate] = useState(null);
    const [endDate, setEndDate] = useState(null);
    
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    const collaboratorEvaluations = useMemo(() => evaluations.filter(e => e.collaboratorId === collaboratorId), [evaluations, collaboratorId]);

    const handleDayClick = (day) => {
        const clickedDate = new Date(year, month, day);
        if (!startDate || (startDate && endDate)) {
            setStartDate(clickedDate);
            setEndDate(null);
        } else if (clickedDate < startDate) {
            setStartDate(clickedDate);
            setEndDate(null);
        } else {
            setEndDate(clickedDate);
        }
    };
    
    const handlePrevMonth = () => setCurrentDate(new Date(year, month - 1, 15));
    const handleNextMonth = () => setCurrentDate(new Date(year, month + 1, 15));

    const getEvaluationsForDay = (day) => {
        const date = new Date(year, month, day);
        return collaboratorEvaluations.filter(e => {
            const start = parseDate(e.startDate);
            const end = parseDate(e.endDate);
            return start <= date && end >= date;
        });
    };
    
    const formatDate = (date) => date ? new Intl.DateTimeFormat('pt-BR').format(date) : '...';

    const isDateInRange = (day) => {
        if (isReadOnly || !startDate) return false;
        const date = new Date(year, month, day);
        if (endDate) {
            return date >= startDate && date <= endDate;
        }
        return date.getTime() === startDate.getTime();
    }

    return (
        <Card>
            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-4">
                     <button onClick={handlePrevMonth} className="p-2 rounded-full hover:bg-gray-100"><ChevronLeft /></button>
                     <h2 className="text-xl font-bold text-center w-48">{currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase())}</h2>
                     <button onClick={handleNextMonth} className="p-2 rounded-full hover:bg-gray-100"><ChevronRight /></button>
                </div>
            </div>
             {!isReadOnly && (
                 <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-4">
                     <div>
                         <p className="font-semibold text-blue-800">Selecione um período para avaliação:</p>
                         <p className="text-sm text-blue-700">Início: <span className="font-bold">{formatDate(startDate)}</span> | Fim: <span className="font-bold">{formatDate(endDate)}</span></p>
                     </div>
                     <Button onClick={() => onLaunchEvalModal(null, {start: startDate, end: endDate}, collaboratorId)} disabled={!startDate || !endDate}><PlusCircle size={16} /> Lançar Avaliação</Button>
                 </div>
             )}
            <div className="grid grid-cols-7 gap-1 text-center font-semibold text-gray-600">{weekdays.map(day => <div key={day} className="py-2">{day}</div>)}</div>
            <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} />)}
                {Array.from({ length: daysInMonth }).map((_, day) => {
                    const dayNumber = day + 1;
                    const dayEvaluations = getEvaluationsForDay(dayNumber);
                    const isInRange = isDateInRange(dayNumber);
                    
                    // NOVO: Verifica se há alguma avaliação não finalizada no dia
                    const hasUnfinalizedEvaluation = dayEvaluations.some(evalItem => !evalItem.isFinalized);

                    // Define a classe de fundo com base na nova condição
                    const dayBgClass = hasUnfinalizedEvaluation 
                        ? 'bg-red-600' // Vermelho forte se não finalizada
                        : isInRange 
                        ? 'bg-blue-100 border-blue-300' 
                        : 'bg-white';

                    return (
                        <div 
                            key={dayNumber} 
                            onClick={!isReadOnly ? () => handleDayClick(dayNumber) : undefined} 
                            className={`p-2 h-28 border rounded-md transition-colors ${dayBgClass} ${!isReadOnly ? 'cursor-pointer hover:bg-gray-100' : 'cursor-default'} relative`}
                        >
                            <span className={`font-bold ${hasUnfinalizedEvaluation ? 'text-white' : ''}`}>{dayNumber}</span>
                            <div className="mt-1 space-y-1 text-xs text-left">
                                {dayEvaluations.map(e => {
                                    // Define a cor do item da avaliação
                                    const itemBgColor = e.isFinalized 
                                        ? (e.activityType === 'Escritório' ? '#dcfce7' : '#ffedd5')
                                        : '#fecaca'; // Um vermelho mais claro para o item em si
                                    const itemTextColor = e.isFinalized
                                        ? (e.activityType === 'Escritório' ? '#166534' : '#9a3412')
                                        : '#991b1b';

                                    return (
                                        <div 
                                            key={e.id} 
                                            className={`p-1 rounded truncate relative group ${onViewEvaluationDetails ? 'cursor-pointer' : ''}`}
                                            style={{backgroundColor: itemBgColor, color: itemTextColor}}
                                            onClick={onViewEvaluationDetails ? (evt) => { evt.stopPropagation(); onViewEvaluationDetails(e); } : undefined}
                                        >
                                            {e.csName}
                                            {!isReadOnly && (
                                                <div className="absolute z-10 hidden group-hover:flex items-center gap-1 right-1 top-0.5 bg-white/70 backdrop-blur-sm rounded-full px-1">
                                                    <IconButton onClick={(evt) => {evt.stopPropagation(); onLaunchEvalModal(e, null, collaboratorId)}}><Edit size={12}/></IconButton>
                                                    <IconButton onClick={(evt) => {evt.stopPropagation(); handleDeleteEvaluation(e.id)}}><Trash2 size={12}/></IconButton>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )
                })}
            </div>
        </Card>
    );
}

function FinancialModule() {
    const { allCollaborators, evaluations, businessDays } = useContext(AppContext);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());

    const years = useMemo(() => {
        const currentYear = new Date().getFullYear();
        return Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
    }, []);

    const months = Array.from({ length: 12 }, (_, i) => new Date(0, i).toLocaleString('pt-BR', { month: 'long' }));

    const monthlyReport = useMemo(() => {
        const report = [];
        allCollaborators.forEach(collab => {
            const { officeBonus, fieldBonus, totalBonus, officeDaysWorked, totalBusinessDays, officeEvals, fieldEvals } = calculateMonthlyBonus(collab.id, evaluations, businessDays, selectedYear, selectedMonth);
            report.push({
                id: collab.id,
                name: collab.name,
                officeBonus: officeBonus,
                fieldBonus: fieldBonus,
                totalBonus: totalBonus,
                officeDaysWorked: officeDaysWorked,
                totalBusinessDays: totalBusinessDays,
                officeEvals: officeEvals,
                fieldEvals: fieldEvals
            });
        });
        return report;
    }, [allCollaborators, evaluations, businessDays, selectedYear, selectedMonth]);

    const handleExportToCSV = () => {
        const headers = ["Colaborador", "Bônus Escritório (R$)", "Bônus Campo (R$)", "Bônus Total (R$)", "Dias Escritório Trabalhados", "Total Dias Úteis", "Avaliações Escritório", "Avaliações Campo"];
        const rows = monthlyReport.map(row => [
            row.name,
            row.officeBonus.toFixed(2),
            row.fieldBonus.toFixed(2),
            row.totalBonus.toFixed(2),
            row.officeDaysWorked,
            row.totalBusinessDays,
            row.officeEvals,
            row.fieldEvals
        ]);

        let csvContent = "data:text/csv;charset=utf-8," 
            + headers.join(";") + "\n"
            + rows.map(e => e.join(";")).join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `relatorio_bonus_${selectedMonth + 1}_${selectedYear}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-8">
            <h2 className="text-2xl font-bold text-gray-900">Módulo Financeiro</h2>
            <Card>
                <h3 className="text-xl font-semibold mb-4">Relatório Mensal de Bônus</h3>
                <div className="flex gap-4 mb-4">
                    <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} className="p-2 border rounded-md">
                        {years.map(year => <option key={year} value={year}>{year}</option>)}
                    </select>
                    <select value={selectedMonth} onChange={(e) => setSelectedMonth(Number(e.target.value))} className="p-2 border rounded-md">
                        {months.map((monthName, index) => <option key={index} value={index}>{monthName}</option>)}
                    </select>
                    <Button onClick={handleExportToCSV} variant="secondary"><FileSpreadsheet size={16} /> Exportar CSV</Button>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full bg-white border border-gray-200 rounded-lg">
                        <thead>
                            <tr className="bg-gray-100 text-left text-sm font-medium text-gray-600 uppercase tracking-wider">
                                <th className="py-3 px-4 border-b">Colaborador</th>
                                <th className="py-3 px-4 border-b">Bônus Escritório (R$)</th>
                                <th className="py-3 px-4 border-b">Bônus Campo (R$)</th>
                                <th className="py-3 px-4 border-b">Bônus Total (R$)</th>
                                <th className="py-3 px-4 border-b">Dias Escritório Trabalhados</th>
                                <th className="py-3 px-4 border-b">Total Dias Úteis</th>
                                <th className="py-3 px-4 border-b">Avaliações Escritório</th>
                                <th className="py-3 px-4 border-b">Avaliações Campo</th>
                            </tr>
                        </thead>
                        <tbody>
                            {monthlyReport.map(row => (
                                <tr key={row.id} className="border-b border-gray-200 hover:bg-gray-50">
                                    <td className="py-3 px-4 text-sm text-gray-800">{row.name}</td>
                                    <td className="py-3 px-4 text-sm text-gray-800">{row.officeBonus.toFixed(2)}</td>
                                    <td className="py-3 px-4 text-sm text-gray-800">{row.fieldBonus.toFixed(2)}</td>
                                    <td className="py-3 px-4 text-sm text-gray-800 font-semibold">{row.totalBonus.toFixed(2)}</td>
                                    <td className="py-3 px-4 text-sm text-gray-800">{row.officeDaysWorked}</td>
                                    <td className="py-3 px-4 text-sm text-gray-800">{row.totalBusinessDays}</td>
                                    <td className="py-3 px-4 text-sm text-gray-800">{row.officeEvals}</td>
                                    <td className="py-3 px-4 text-sm text-gray-800">{row.fieldEvals}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}

function AuditModule() {
    const { evaluations, allCollaborators, users } = useContext(AppContext);
    const [selectedCollaboratorId, setSelectedCollaboratorId] = useState('');
    const [selectedManagerId, setSelectedManagerId] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const managers = useMemo(() => users.filter(u => u.role === 'manager' || u.role === 'admin' || u.role === 'gerente'), [users]);

    const filteredEvaluations = useMemo(() => {
        return evaluations.filter(evalItem => {
            const evalDate = parseDate(evalItem.createdAt);
            const start = startDate ? new Date(startDate) : null;
            const end = endDate ? new Date(endDate) : null;

            const matchesCollaborator = selectedCollaboratorId ? evalItem.collaboratorId === selectedCollaboratorId : true;
            const matchesManager = selectedManagerId ? evalItem.managerId === selectedManagerId : true;
            const matchesDate = (!start || evalDate >= start) && (!end || evalDate <= end);

            return matchesCollaborator && matchesManager && matchesDate;
        }).sort((a, b) => parseDate(b.createdAt).getTime() - parseDate(a.createdAt).getTime());
    }, [evaluations, selectedCollaboratorId, selectedManagerId, startDate, endDate]);

    const getCollaboratorName = (id) => allCollaborators.find(c => c.id === id)?.name || 'Desconhecido';
    const getManagerName = (id) => users.find(u => u.id === id)?.name || 'Desconhecido';

    return (
        <div className="space-y-8">
            <h2 className="text-2xl font-bold text-gray-900">Módulo de Auditoria</h2>
            <Card>
                <h3 className="text-xl font-semibold mb-4">Filtrar Avaliações</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Colaborador</label>
                        <select value={selectedCollaboratorId} onChange={e => setSelectedCollaboratorId(e.target.value)} className="mt-1 block w-full p-2 border rounded-md">
                            <option value="">Todos</option>
                            {allCollaborators.map(collab => <option key={collab.id} value={collab.id}>{collab.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Gerente/Admin</label>
                        <select value={selectedManagerId} onChange={e => setSelectedManagerId(e.target.value)} className="mt-1 block w-full p-2 border rounded-md">
                            <option value="">Todos</option>
                            {managers.map(manager => <option key={manager.id} value={manager.id}>{manager.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Data Início</label>
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="mt-1 block w-full p-2 border rounded-md" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Data Fim</label>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="mt-1 block w-full p-2 border rounded-md" />
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full bg-white border border-gray-200 rounded-lg">
                        <thead>
                            <tr className="bg-gray-100 text-left text-sm font-medium text-gray-600 uppercase tracking-wider">
                                <th className="py-3 px-4 border-b">Data</th>
                                <th className="py-3 px-4 border-b">Colaborador</th>
                                <th className="py-3 px-4 border-b">Tipo Atividade</th>
                                <th className="py-3 px-4 border-b">CS Name</th>
                                <th className="py-3 px-4 border-b">Gerente/Admin</th>
                                <th className="py-3 px-4 border-b">Finalizada</th>
                                <th className="py-3 px-4 border-b">Observação</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredEvaluations.length === 0 ? (
                                <tr><td colSpan="7" className="py-4 text-center text-gray-500">Nenhuma avaliação encontrada com os filtros aplicados.</td></tr>
                            ) : (
                                filteredEvaluations.map(evalItem => (
                                    <tr key={evalItem.id} className="border-b border-gray-200 hover:bg-gray-50">
                                        <td className="py-3 px-4 text-sm text-gray-800">{new Date(evalItem.createdAt).toLocaleDateString('pt-BR')}</td>
                                        <td className="py-3 px-4 text-sm text-gray-800">{getCollaboratorName(evalItem.collaboratorId)}</td>
                                        <td className="py-3 px-4 text-sm text-gray-800">{evalItem.activityType}</td>
                                        <td className="py-3 px-4 text-sm text-gray-800">{evalItem.csName}</td>
                                        <td className="py-3 px-4 text-sm text-gray-800">{getManagerName(evalItem.managerId)}</td>
                                        <td className="py-3 px-4 text-sm text-gray-800">{evalItem.isFinalized ? <CheckCircle2 className="text-green-500" size={20} /> : <XCircle className="text-red-500" size={20} />}</td>
                                        <td className="py-3 px-4 text-sm text-gray-800 max-w-xs truncate" title={evalItem.observation}>{evalItem.observation}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}

function CollaboratorViewModule() {
    const { currentUser, evaluations, businessDays } = useContext(AppContext);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
    const [viewingEvaluation, setViewingEvaluation] = useState(null);

    const years = useMemo(() => {
        const currentYear = new Date().getFullYear();
        return Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
    }, []);

    const months = Array.from({ length: 12 }, (_, i) => new Date(0, i).toLocaleString('pt-BR', { month: 'long' }));

    const myMonthlyBonus = useMemo(() => {
        if (!currentUser?.collaboratorId) return null;
        return calculateMonthlyBonus(currentUser.collaboratorId, evaluations, businessDays, selectedYear, selectedMonth);
    }, [currentUser, evaluations, businessDays, selectedYear, selectedMonth]);

    const myEvaluations = useMemo(() => {
        if (!currentUser?.collaboratorId) return [];
        return evaluations.filter(e => {
            const evalDate = parseDate(e.startDate);
            return e.collaboratorId === currentUser.collaboratorId &&
                   evalDate.getFullYear() === selectedYear &&
                   evalDate.getMonth() === selectedMonth;
        }).sort((a, b) => parseDate(b.startDate).getTime() - parseDate(a.startDate).getTime());
    }, [currentUser, evaluations, selectedYear, selectedMonth]);

    if (!currentUser?.collaboratorId) {
        return <p>Seu perfil de usuário não está associado a um colaborador. Entre em contato com o administrador.</p>;
    }

    return (
        <div className="space-y-8">
            <h2 className="text-2xl font-bold text-gray-900">Minhas Avaliações e Bônus</h2>
            <Card>
                <h3 className="text-xl font-semibold mb-4">Resumo Mensal</h3>
                <div className="flex gap-4 mb-4">
                    <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} className="p-2 border rounded-md">
                        {years.map(year => <option key={year} value={year}>{year}</option>)}
                    </select>
                    <select value={selectedMonth} onChange={(e) => setSelectedMonth(Number(e.target.value))} className="p-2 border rounded-md">
                        {months.map((monthName, index) => <option key={index} value={index}>{monthName}</option>)}
                    </select>
                </div>
                {myMonthlyBonus ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                        <div className="p-4 bg-blue-50 rounded-lg shadow-sm">
                            <p className="text-sm text-blue-700">Bônus Escritório</p>
                            <p className="text-2xl font-bold text-blue-800">R$ {myMonthlyBonus.officeBonus.toFixed(2)}</p>
                        </div>
                        <div className="p-4 bg-yellow-50 rounded-lg shadow-sm">
                            <p className="text-sm text-yellow-700">Bônus Campo</p>
                            <p className="text-2xl font-bold text-yellow-800">R$ {myMonthlyBonus.fieldBonus.toFixed(2)}</p>
                        </div>
                        <div className="p-4 bg-green-50 rounded-lg shadow-sm">
                            <p className="text-sm text-green-700">Bônus Total</p>
                            <p className="text-2xl font-bold text-green-800">R$ {myMonthlyBonus.totalBonus.toFixed(2)}</p>
                        </div>
                    </div>
                ) : (
                    <p className="text-gray-600">Nenhum dado de bônus disponível para o período selecionado.</p>
                )}
            </Card>

            <Card>
                <h3 className="text-xl font-semibold mb-4">Minhas Avaliações do Mês</h3>
                <div className="overflow-x-auto">
                    <table className="min-w-full bg-white border border-gray-200 rounded-lg">
                        <thead>
                            <tr className="bg-gray-100 text-left text-sm font-medium text-gray-600 uppercase tracking-wider">
                                <th className="py-3 px-4 border-b">Período</th>
                                <th className="py-3 px-4 border-b">Tipo Atividade</th>
                                <th className="py-3 px-4 border-b">CS Name</th>
                                <th className="py-3 px-4 border-b">Gerente</th>
                                <th className="py-3 px-4 border-b">Finalizada</th>
                                <th className="py-3 px-4 border-b">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {myEvaluations.length === 0 ? (
                                <tr><td colSpan="6" className="py-4 text-center text-gray-500">Nenhuma avaliação encontrada para este mês.</td></tr>
                            ) : (
                                myEvaluations.map(evalItem => (
                                    <tr key={evalItem.id} className="border-b border-gray-200 hover:bg-gray-50">
                                        <td className="py-3 px-4 text-sm text-gray-800">{evalItem.startDate} a {evalItem.endDate}</td>
                                        <td className="py-3 px-4 text-sm text-gray-800">{evalItem.activityType}</td>
                                        <td className="py-3 px-4 text-sm text-gray-800">{evalItem.csName}</td>
                                        <td className="py-3 px-4 text-sm text-gray-800">{evalItem.managerName}</td>
                                        <td className="py-3 px-4 text-sm text-gray-800">{evalItem.isFinalized ? <CheckCircle2 className="text-green-500" size={20} /> : <XCircle className="text-red-500" size={20} />}</td>
                                        <td className="py-3 px-4 text-sm text-gray-800">
                                            <Button variant="secondary" onClick={() => setViewingEvaluation(evalItem)}>Ver Detalhes</Button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
            {viewingEvaluation && (
                <EvaluationDetailModal
                    isOpen={!!viewingEvaluation}
                    onClose={() => setViewingEvaluation(null)}
                    evaluation={viewingEvaluation}
                />
            )}
        </div>
    );
}

function CollaboratorManagementModule({ onLaunchCollaboratorModal }) {
    const { allCollaborators, handleDeleteCollaborator } = useContext(AppContext);

    return (
        <div className="space-y-8">
            <h2 className="text-2xl font-bold text-gray-900">Gestão de Colaboradores</h2>
            <Card>
                <div className="flex justify-end mb-4">
                    <Button onClick={() => onLaunchCollaboratorModal(null)}><UserPlus size={16} /> Adicionar Colaborador</Button>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full bg-white border border-gray-200 rounded-lg">
                        <thead>
                            <tr className="bg-gray-100 text-left text-sm font-medium text-gray-600 uppercase tracking-wider">
                                <th className="py-3 px-4 border-b">Nome</th>
                                <th className="py-3 px-4 border-b">Equipe</th>
                                <th className="py-3 px-4 border-b">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {allCollaborators.length === 0 ? (
                                <tr><td colSpan="3" className="py-4 text-center text-gray-500">Nenhum colaborador cadastrado.</td></tr>
                            ) : (
                                allCollaborators.map(collab => (
                                    <tr key={collab.id} className="border-b border-gray-200 hover:bg-gray-50">
                                        <td className="py-3 px-4 text-sm text-gray-800">{collab.name}</td>
                                        <td className="py-3 px-4 text-sm text-gray-800">{collab.team}</td>
                                        <td className="py-3 px-4 text-sm text-gray-800 flex gap-2">
                                            <IconButton onClick={() => onLaunchCollaboratorModal(collab)}><Edit size={18} /></IconButton>
                                            <IconButton onClick={() => handleDeleteCollaborator(collab.id)}><Trash2 size={18} /></IconButton>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}

function AccessControlModule({ onLaunchAccessModal }) {
    const { users, handleDeleteSystemUser } = useContext(AppContext);

    return (
        <div className="space-y-8">
            <h2 className="text-2xl font-bold text-gray-900">Controle de Acesso</h2>
            <Card>
                <div className="flex justify-end mb-4">
                    <Button onClick={() => onLaunchAccessModal(null)}><UserPlus size={16} /> Adicionar Usuário</Button>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full bg-white border border-gray-200 rounded-lg">
                        <thead>
                            <tr className="bg-gray-100 text-left text-sm font-medium text-gray-600 uppercase tracking-wider">
                                <th className="py-3 px-4 border-b">Nome</th>
                                <th className="py-3 px-4 border-b">Email</th>
                                <th className="py-3 px-4 border-b">Função</th>
                                <th className="py-3 px-4 border-b">Equipe</th>
                                <th className="py-3 px-4 border-b">Colaborador Associado</th>
                                <th className="py-3 px-4 border-b">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.length === 0 ? (
                                <tr><td colSpan="6" className="py-4 text-center text-gray-500">Nenhum usuário cadastrado.</td></tr>
                            ) : (
                                users.map(user => (
                                    <tr key={user.id} className="border-b border-gray-200 hover:bg-gray-50">
                                        <td className="py-3 px-4 text-sm text-gray-800">{user.name}</td>
                                        <td className="py-3 px-4 text-sm text-gray-800">{user.email}</td>
                                        <td className="py-3 px-4 text-sm text-gray-800">{user.role}</td>
                                        <td className="py-3 px-4 text-sm text-gray-800">{user.team || '-'}</td>
                                        <td className="py-3 px-4 text-sm text-gray-800">{user.collaboratorId || '-'}</td>
                                        <td className="py-3 px-4 text-sm text-gray-800 flex gap-2">
                                            <IconButton onClick={() => onLaunchAccessModal(user)}><Edit size={18} /></IconButton>
                                            <IconButton onClick={() => handleDeleteSystemUser(user.id, user.name)}><Trash2 size={18} /></IconButton>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}

function BusinessDaysModule() {
    const { businessDays, handleSaveBusinessDays } = useContext(AppContext);
    const [year, setYear] = useState(new Date().getFullYear());
    const [month, setMonth] = useState(new Date().getMonth());
    const [days, setDays] = useState('');

    const years = useMemo(() => {
        const currentYear = new Date().getFullYear();
        return Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
    }, []);

    const months = Array.from({ length: 12 }, (_, i) => new Date(0, i).toLocaleString('pt-BR', { month: 'long' }));

    useEffect(() => {
        const monthId = `${year}-${String(month + 1).padStart(2, '0')}`;
        setDays(businessDays[monthId]?.days || '');
    }, [year, month, businessDays]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (days) {
            handleSaveBusinessDays(year, month, days);
            alert('Dias úteis salvos com sucesso!');
        }
    };

    return (
        <div className="space-y-8">
            <h2 className="text-2xl font-bold text-gray-900">Configurar Dias Úteis</h2>
            <Card>
                <h3 className="text-xl font-semibold mb-4">Definir Dias Úteis por Mês</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="flex gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Ano</label>
                            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="mt-1 p-2 border rounded-md">
                                {years.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Mês</label>
                            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="mt-1 p-2 border rounded-md">
                                {months.map((monthName, index) => <option key={index} value={index}>{monthName}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Dias Úteis</label>
                            <input type="number" value={days} onChange={(e) => setDays(e.target.value)} className="mt-1 p-2 border rounded-md w-24" min="1" max="31" required />
                        </div>
                    </div>
                    <Button type="submit"><Save size={16} /> Salvar Dias Úteis</Button>
                </form>
                <div className="mt-6">
                    <h4 className="text-lg font-semibold mb-2">Dias Úteis Registrados:</h4>
                    <ul className="list-disc list-inside">
                        {Object.entries(businessDays).sort().map(([monthId, data]) => (
                            <li key={monthId} className="text-sm text-gray-700">{monthId}: {data.days} dias</li>
                        ))}
                    </ul>
                </div>
            </Card>
        </div>
    );
}

// --- MODAIS ---
function Modal({ isOpen, onClose, children, title }) {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto transform transition-all scale-100 opacity-100">
                <div className="flex justify-between items-center p-4 border-b">
                    <h2 className="text-xl font-bold text-gray-800">{title}</h2>
                    <IconButton onClick={onClose}><X size={20} /></IconButton>
                </div>
                <div className="p-6">
                    {children}
                </div>
            </div>
        </div>
    );
}

function EvaluationModal({ isOpen, onClose, initialData, dateRange, collaboratorId }) {
    const { handleSaveEvaluation, allCollaborators } = useContext(AppContext);
    const [formData, setFormData] = useState({
        activityType: 'Escritório',
        csName: '',
        startDate: '',
        endDate: '',
        criteria: {},
        observation: '',
        isFinalized: false, // NOVO: Campo para indicar se a avaliação está finalizada
        collaboratorId: collaboratorId
    });

    useEffect(() => {
        const defaultData = {
            activityType: 'Escritório',
            csName: '',
            startDate: dateRange?.start ? dateRange.start.toISOString().split('T')[0] : '',
            endDate: dateRange?.end ? dateRange.end.toISOString().split('T')[0] : '',
            criteria: {},
            observation: '',
            isFinalized: false, // <-- Adicione o valor padrão
            collaboratorId: collaboratorId
        };
        const dataToEdit = initialData ? { ...initialData } : defaultData;
        setFormData(dataToEdit);
    }, [initialData, dateRange, collaboratorId]);

    const handleChange = (field, value) => {
        setFormData(f => ({ ...f, [field]: value }));
    };

    const handleCriteriaChange = (key, value) => {
        setFormData(f => ({
            ...f,
            criteria: {
                ...f.criteria,
                [key]: value
            }
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        await handleSaveEvaluation(formData);
        onClose();
    };

    const renderCriteria = () => {
        if (formData.activityType === 'Escritório') {
            return (
                <div className="space-y-3">
                    <h4 className="font-semibold text-gray-700">Critérios de Avaliação (Escritório)</h4>
                    {[1, 2, 3].map(i => (
                        <div key={i} className="flex items-center gap-2">
                            <label className="flex-1 text-sm">Critério {i}</label>
                            <select value={formData.criteria[`criterio${i}`] || ''} onChange={e => handleCriteriaChange(`criterio${i}`, Number(e.target.value))} className="p-2 border rounded-md">
                                <option value="">Selecione</option>
                                <option value={0}>Não Atendido</option>
                                <option value={1}>Parcialmente Atendido</option>
                                <option value={2}>Totalmente Atendido</option>
                            </select>
                        </div>
                    ))}
                </div>
            );
        } else if (formData.activityType === 'Campo') {
            return (
                <div className="space-y-3">
                    <h4 className="font-semibold text-gray-700">Critérios de Avaliação (Campo)</h4>
                    <div className="flex items-center gap-2">
                        <label className="flex-1 text-sm">Equipamento</label>
                        <select value={formData.criteria.equipamento || ''} onChange={e => handleCriteriaChange('equipamento', Number(e.target.value))} className="p-2 border rounded-md">
                            <option value="">Selecione</option>
                            <option value={0}>Falha</option>
                            <option value={1}>OK</option>
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="flex-1 text-sm">Checklist</label>
                        <select value={formData.criteria.checklist || ''} onChange={e => handleCriteriaChange('checklist', Number(e.target.value))} className="p-2 border rounded-md">
                            <option value="">Selecione</option>
                            <option value={0}>Não Conforme</option>
                            <option value={1}>Conforme</option>
                        </select>
                    </div>
                </div>
            );
        }
        return null;
    };

    const selectedCollaborator = allCollaborators.find(c => c.id === formData.collaboratorId);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={initialData ? 'Editar Avaliação' : 'Lançar Nova Avaliação'}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Colaborador</label>
                    <select value={formData.collaboratorId} onChange={e => handleChange('collaboratorId', e.target.value)} className="mt-1 block w-full p-2 border rounded-md" required>
                        <option value="">Selecione um colaborador</option>
                        {allCollaborators.map(collab => (
                            <option key={collab.id} value={collab.id}>{collab.name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Tipo de Atividade</label>
                    <select value={formData.activityType} onChange={e => handleChange('activityType', e.target.value)} className="mt-1 block w-full p-2 border rounded-md">
                        <option value="Escritório">Escritório</option>
                        <option value="Campo">Campo</option>
                    </select>
                </div>
                {formData.activityType === 'Campo' && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Nome do CS</label>
                        <input type="text" value={formData.csName} onChange={e => handleChange('csName', e.target.value)} className="mt-1 block w-full p-2 border rounded-md" required />
                    </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Data Início</label>
                        <input type="date" value={formData.startDate} onChange={e => handleChange('startDate', e.target.value)} className="mt-1 block w-full p-2 border rounded-md" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Data Fim</label>
                        <input type="date" value={formData.endDate} onChange={e => handleChange('endDate', e.target.value)} className="mt-1 block w-full p-2 border rounded-md" required />
                    </div>
                </div>
                {renderCriteria()}
                <div>
                    <label className="block text-sm font-medium text-gray-700">Observação</label>
                    <textarea value={formData.observation} onChange={e => handleChange('observation', e.target.value)} className="mt-1 block w-full p-2 border rounded-md h-24"></textarea>
                </div>
                
                {/* NOVO: Checkbox Avaliação Finalizada */}
                <div>
                    <label className="flex items-center space-x-3 cursor-pointer p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                        <input 
                            type="checkbox"
                            checked={formData.isFinalized || false}
                            onChange={e => setFormData(f => ({...f, isFinalized: e.target.checked}))}
                            className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="font-semibold text-yellow-800">Avaliação Finalizada</span>
                    </label>
                    <p className="text-xs text-gray-500 mt-1">
                        Marque esta caixa para confirmar que a avaliação está completa. Avaliações não finalizadas não entram no cálculo do bônus.
                    </p>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button type="submit"><Save size={16} /> Salvar Avaliação</Button>
                </div>
            </form>
        </Modal>
    );
}

function EvaluationDetailModal({ isOpen, onClose, evaluation }) {
    if (!evaluation) return null;

    const renderCriteria = () => {
        if (evaluation.activityType === 'Escritório') {
            return (
                <div className="space-y-2">
                    <p><span className="font-semibold">Critério 1:</span> {evaluation.criteria.criterio1 === 0 ? 'Não Atendido' : evaluation.criteria.criterio1 === 1 ? 'Parcialmente Atendido' : 'Totalmente Atendido'}</p>
                    <p><span className="font-semibold">Critério 2:</span> {evaluation.criteria.criterio2 === 0 ? 'Não Atendido' : evaluation.criteria.criterio2 === 1 ? 'Parcialmente Atendido' : 'Totalmente Atendido'}</p>
                    <p><span className="font-semibold">Critério 3:</span> {evaluation.criteria.criterio3 === 0 ? 'Não Atendido' : evaluation.criteria.criterio3 === 1 ? 'Parcialmente Atendido' : 'Totalmente Atendido'}</p>
                </div>
            );
        } else if (evaluation.activityType === 'Campo') {
            return (
                <div className="space-y-2">
                    <p><span className="font-semibold">Equipamento:</span> {evaluation.criteria.equipamento === 0 ? 'Falha' : 'OK'}</p>
                    <p><span className="font-semibold">Checklist:</span> {evaluation.criteria.checklist === 0 ? 'Não Conforme' : 'Conforme'}</p>
                </div>
            );
        }
        return null;
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Detalhes da Avaliação">
            <div className="space-y-4">
                <p><span className="font-semibold">Colaborador:</span> {evaluation.collaboratorName}</p>
                <p><span className="font-semibold">Tipo de Atividade:</span> {evaluation.activityType}</p>
                {evaluation.activityType === 'Campo' && <p><span className="font-semibold">CS Name:</span> {evaluation.csName}</p>}
                <p><span className="font-semibold">Período:</span> {evaluation.startDate} a {evaluation.endDate}</p>
                <p><span className="font-semibold">Gerente/Admin:</span> {evaluation.managerName}</p>
                <p><span className="font-semibold">Finalizada:</span> {evaluation.isFinalized ? 'Sim' : 'Não'}</p>
                <div>
                    <h4 className="font-semibold text-gray-700">Critérios:</h4>
                    {renderCriteria()}
                </div>
                <p><span className="font-semibold">Observação:</span> {evaluation.observation || 'Nenhuma'}</p>
                <p className="text-sm text-gray-500">Criado em: {new Date(evaluation.createdAt).toLocaleDateString('pt-BR')} às {new Date(evaluation.createdAt).toLocaleTimeString('pt-BR')}</p>
            </div>
        </Modal>
    );
}

function CollaboratorModal({ isOpen, onClose, initialData }) {
    const { handleSaveCollaborator } = useContext(AppContext);
    const [formData, setFormData] = useState({
        name: '',
        team: '',
    });

    useEffect(() => {
        if (initialData) {
            setFormData(initialData);
        } else {
            setFormData({ name: '', team: '' });
        }
    }, [initialData]);

    const handleChange = (field, value) => {
        setFormData(f => ({ ...f, [field]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        await handleSaveCollaborator(formData);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={initialData ? 'Editar Colaborador' : 'Adicionar Novo Colaborador'}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Nome</label>
                    <input type="text" value={formData.name} onChange={e => handleChange('name', e.target.value)} className="mt-1 block w-full p-2 border rounded-md" required />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Equipe</label>
                    <input type="text" value={formData.team} onChange={e => handleChange('team', e.target.value)} className="mt-1 block w-full p-2 border rounded-md" required />
                </div>
                <div className="flex justify-end gap-3 mt-6">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button type="submit"><Save size={16} /> Salvar Colaborador</Button>
                </div>
            </form>
        </Modal>
    );
}

function AccessControlModal({ isOpen, onClose, initialData }) {
    const { handleSaveSystemUser, allCollaborators, handleSendPasswordReset } = useContext(AppContext);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        role: 'collaborator',
        team: '',
        collaboratorId: '',
        password: ''
    });

    useEffect(() => {
        if (initialData) {
            setFormData({ ...initialData, password: '' }); // Limpar senha ao editar
        } else {
            setFormData({ name: '', email: '', role: 'collaborator', team: '', collaboratorId: '', password: '' });
        }
    }, [initialData]);

    const handleChange = (field, value) => {
        setFormData(f => ({ ...f, [field]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        await handleSaveSystemUser(formData);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={initialData ? 'Editar Usuário do Sistema' : 'Adicionar Novo Usuário do Sistema'}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Nome</label>
                    <input type="text" value={formData.name} onChange={e => handleChange('name', e.target.value)} className="mt-1 block w-full p-2 border rounded-md" required />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Email</label>
                    <input type="email" value={formData.email} onChange={e => handleChange('email', e.target.value)} className="mt-1 block w-full p-2 border rounded-md" required />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Função</label>
                    <select value={formData.role} onChange={e => handleChange('role', e.target.value)} className="mt-1 block w-full p-2 border rounded-md">
                        <option value="collaborator">Colaborador</option>
                        <option value="manager">Gestor</option>
                        <option value="financeiro">Financeiro</option>
                        <option value="gerente">Gerente</option>
                        <option value="admin">Admin</option>
                    </select>
                </div>
                {(formData.role === 'manager' || formData.role === 'gerente') && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Equipe (separar por vírgula se mais de uma)</label>
                        <input type="text" value={formData.team} onChange={e => handleChange('team', e.target.value)} className="mt-1 block w-full p-2 border rounded-md" placeholder="Ex: Vendas, Suporte" />
                    </div>
                )}
                {formData.role === 'collaborator' && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Colaborador Associado</label>
                        <select value={formData.collaboratorId} onChange={e => handleChange('collaboratorId', e.target.value)} className="mt-1 block w-full p-2 border rounded-md" required>
                            <option value="">Selecione um colaborador</option>
                            {allCollaborators.map(collab => (
                                <option key={collab.id} value={collab.id}>{collab.name}</option>
                            ))}
                        </select>
                    </div>
                )}
                {/* NOVO: Campo de senha para admin */}
                {initialData ? (
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Nova Senha (Opcional)</label>
                        <input 
                            type="password" 
                            placeholder="Deixe em branco para não alterar"
                            onChange={e => handleChange('password', e.target.value)} 
                            className="mt-1 block w-full p-2 border rounded-md" 
                        />
                        <Button className="w-full mt-2" variant="secondary" onClick={() => handleSendPasswordReset(formData.email)}>
                            Ou Enviar E-mail de Redefinição
                        </Button>
                    </div>
                ) : (
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Senha Inicial</label>
                        <input type="password" value={formData.password} onChange={e => handleChange('password', e.target.value)} className="mt-1 block w-full p-2 border rounded-md" required />
                    </div>
                )}

                <div className="flex justify-end gap-3 mt-6">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button type="submit"><Save size={16} /> Salvar Usuário</Button>
                </div>
            </form>
        </Modal>
    );
}

function ConfirmationModal({ isOpen, onClose, onConfirm, title, message }) {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md transform transition-all scale-100 opacity-100">
                <div className="flex justify-between items-center p-4 border-b">
                    <h2 className="text-xl font-bold text-gray-800">{title}</h2>
                    <IconButton onClick={onClose}><X size={20} /></IconButton>
                </div>
                <div className="p-6 space-y-4">
                    <p className="text-gray-700">{message}</p>
                    <div className="flex justify-end gap-3">
                        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
                        <Button type="button" variant="danger" onClick={onConfirm}>Confirmar</Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ForcePasswordChangeModal() {
    const { handleChangePassword, handleLogout } = useContext(AppContext);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess(false);

        if (newPassword.length < 6) {
            setError('A senha deve ter no mínimo 6 caracteres.');
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('As senhas não coincidem.');
            return;
        }

        const result = await handleChangePassword(newPassword);
        if (result.success) {
            setSuccess(true);
        } else {
            setError(result.message);
        }
    };

    return (
        <Modal isOpen={true} onClose={() => {}} title="Alterar Senha Obrigatória">
            <div className="space-y-4">
                <p className="text-red-600 font-semibold flex items-center gap-2"><AlertTriangle size={20} /> Sua senha precisa ser alterada para continuar.</p>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Nova Senha</label>
                        <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="mt-1 block w-full p-2 border rounded-md" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Confirmar Nova Senha</label>
                        <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="mt-1 block w-full p-2 border rounded-md" required />
                    </div>
                    {error && <p className="text-red-500 text-sm">{error}</p>}
                    {success && <p className="text-green-500 text-sm">Senha alterada com sucesso! Você será redirecionado.</p>}
                    <div className="flex justify-end gap-3">
                        <Button type="button" variant="secondary" onClick={handleLogout}>Sair</Button>
                        <Button type="submit" disabled={success}>Alterar Senha</Button>
                    </div>
                </form>
            </div>
        </Modal>
    );
}

